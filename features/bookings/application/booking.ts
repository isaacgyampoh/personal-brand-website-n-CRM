import "server-only";
import { UserError } from "@/lib/errors";
import { db, tx, type Db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { hashToken, humanReference, randomToken, signValue } from "@/lib/security/crypto";
import { isExclusionViolation, raisedToken } from "@/lib/database/errors";
import { formatDateTime, isValidTimeZone } from "@/lib/time";
import { googleCalendarLink } from "@/lib/ics";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { loadSetting } from "@/features/settings/application/settings";
import { logActivity, upsertContact } from "@/features/crm/application/contacts";
import { enqueueEmail } from "@/features/notifications/application/send";
import { paymentGateway } from "@/features/payments/application/gateway";
import { PaymentsNotConfiguredError } from "@/features/payments/domain/gateway";
import { completeFreeOrderIfZero, createOrder, holdMinutes, startPayment } from "@/features/commerce/application/checkout";
import { requestRefund } from "@/features/commerce/application/refunds";
import { blockRange, computeSlots, groupSlotKey, withinCustomerCutoff, type Slot } from "../domain/availability";
import { bookingRepo, toRules, type AppointmentRow, type ServiceRow } from "../infrastructure/repository";

export class BookingError extends UserError {}

async function businessTz(): Promise<string> {
  return (await loadSetting("business")).timezone;
}

export async function availableSlots(service: ServiceRow, day: string, opts: { ignoreSlotGroup?: string } = {}): Promise<Slot[]> {
  const tz = await businessTz();
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 2 * 86400_000);
  const to = new Date(Date.parse(`${day}T00:00:00Z`) + 3 * 86400_000);
  const [rules, exceptions, busy] = await Promise.all([
    bookingRepo.weeklyRules(service.id),
    bookingRepo.exceptions(service.id, from, to),
    bookingRepo.busy(from, to),
  ]);
  return computeSlots({ day, tz, now: new Date(), service: toRules(service), rules, exceptions, busy, ignoreSlotGroup: opts.ignoreSlotGroup });
}

/** Days (business-local) in the next `days` that have at least one slot. */
export async function availableDays(service: ServiceRow, startDay: string, days: number): Promise<string[]> {
  const tz = await businessTz();
  const from = new Date(Date.parse(`${startDay}T00:00:00Z`) - 86400_000);
  const to = new Date(Date.parse(`${startDay}T00:00:00Z`) + (days + 1) * 86400_000);
  const [rules, exceptions, busy] = await Promise.all([
    bookingRepo.weeklyRules(service.id),
    bookingRepo.exceptions(service.id, from, to),
    bookingRepo.busy(from, to),
  ]);
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * 86400_000).toISOString().slice(0, 10);
    if (computeSlots({ day, tz, now, service: toRules(service), rules, exceptions, busy }).length) out.push(day);
  }
  return out;
}

function mapBookingDbError(error: unknown): never {
  if (isExclusionViolation(error) || raisedToken(error) === "SLOT_FULL") {
    throw new BookingError("Sorry, that time was just booked by someone else. Please choose another time.");
  }
  throw error;
}

export type BookingRequest = {
  serviceSlug: string;
  startsAt: string;
  customer: { fullName: string; email: string; phone?: string; notes?: string; timezone?: string; consentMarketing?: boolean };
  discountCode?: string;
  userId?: string | null;
  attribution?: Record<string, unknown>;
};

export type BookingOutcome =
  | { kind: "confirmed"; reference: string; manageToken: string }
  | { kind: "payment"; reference: string; authorizationUrl: string };

export async function createBooking(req: BookingRequest): Promise<BookingOutcome> {
  const service = await bookingRepo.serviceBySlug(req.serviceSlug);
  if (!service || !service.is_active || service.booking_mode !== "instant") throw new BookingError("This service can't be booked online.");
  const start = new Date(req.startsAt);
  if (Number.isNaN(start.getTime())) throw new BookingError("Please choose a valid time.");
  const tz = await businessTz();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(start);
  const slots = await availableSlots(service, day);
  if (!slots.some((s) => s.start.getTime() === start.getTime())) {
    throw new BookingError("That time is no longer available. Please choose another time.");
  }
  const paid = service.price_minor > 0;
  if (paid && !paymentGateway()) throw new PaymentsNotConfiguredError();

  const customerTz = req.customer.timezone && isValidTimeZone(req.customer.timezone) ? req.customer.timezone : tz;
  const manageToken = randomToken(24);
  const hold = await holdMinutes();
  const expiresAt = new Date(Date.now() + hold * 60_000);
  const range = blockRange(toRules(service), start);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);

  const result = await tx(async (t) => {
    await bookingRepo.expireStaleHolds(t);
    const { id: contactId } = await upsertContact(t, {
      email: req.customer.email, fullName: req.customer.fullName, phone: req.customer.phone || null,
      source: "booking", attribution: req.attribution, consentMarketing: req.customer.consentMarketing, consentSource: "booking form",
    });
    const reference = humanReference("BK");
    const apptId = (await t.one<{ id: string }>("select gen_random_uuid() as id"))!.id;
    const slotGroup = service.capacity > 1 ? groupSlotKey(service.id, start) : apptId;
    try {
      await t.query("savepoint insert_appt");
      await t.query(
        `insert into appointments (id, reference, service_id, contact_id, user_id, starts_at, ends_at, block_range, slot_group,
            status, hold_expires_at, customer_timezone, customer_notes, meeting_url, manage_token_hash, attribution)
         values ($1,$2,$3,$4,$5,$6,$7,tstzrange($8,$9),$10,$11,$12,$13,$14,$15,$16,$17)`,
        [apptId, reference, service.id, contactId, req.userId ?? null, start, end, range.start, range.end, slotGroup,
         paid ? "pending_payment" : "confirmed", paid ? expiresAt : null, customerTz, (req.customer.notes ?? "").slice(0, 2000),
         service.default_meeting_url, hashToken(manageToken), JSON.stringify(req.attribution ?? {})],
      );
      await t.query("release savepoint insert_appt");
    } catch (error) {
      await t.query("rollback to savepoint insert_appt");
      mapBookingDbError(error);
    }
    await logActivity(t, contactId, "booking", `Booked ${service.name} for ${formatDateTime(start, tz)}`, { data: { appointmentId: apptId } });

    if (!paid) {
      await sendBookingConfirmation(t, apptId, manageToken);
      return { kind: "confirmed" as const, reference, manageToken, orderId: null };
    }
    const { order } = await createOrder(t, {
      customer: { email: req.customer.email, fullName: req.customer.fullName, phone: req.customer.phone },
      userId: req.userId,
      items: [{ itemType: "appointment", itemId: apptId, description: `${service.name} — ${formatDateTime(start, tz)}`, quantity: 1, unitPriceMinor: service.price_minor, currency: service.currency }],
      discountCode: req.discountCode,
      attribution: req.attribution,
      expiresAt,
    });
    await t.query("update appointments set order_id = $2 where id = $1", [apptId, order.id]);
    // The fulfiller mints a fresh manage token on confirmation; no plaintext token is stored.
    if (await completeFreeOrderIfZero(t, order)) {
      return { kind: "confirmed" as const, reference, manageToken, orderId: order.id };
    }
    return { kind: "pending" as const, reference, orderId: order.id };
  });

  if (result.kind === "confirmed") return { kind: "confirmed", reference: result.reference, manageToken: result.manageToken };
  const { authorizationUrl } = await startPayment(result.orderId!);
  return { kind: "payment", reference: result.reference, authorizationUrl };
}

function calendarLinks(a: { id: string; starts_at: Date; ends_at: Date }, title: string, location: string) {
  const icsToken = signValue(`appointment:${a.id}`, Math.floor(Date.now() / 1000) + 400 * 86400);
  return {
    ics: `${env().APP_URL}/api/ics/${icsToken}`,
    google: googleCalendarLink({ title, start: a.starts_at, end: a.ends_at, location }),
  };
}

export function locationText(service: ServiceRow, appt: { meeting_url?: string | null }): string {
  if (service.location_type === "online") return appt.meeting_url ? "Online — joining link in your booking page" : "Online — joining details will be shared before the session";
  if (service.location_type === "phone") return "Phone call";
  return service.location_details || "In person";
}

/** Confirmation email (used for free bookings and by the payment fulfiller). */
export async function sendBookingConfirmation(t: Db, appointmentId: string, manageToken: string | null) {
  const a = await t.one<AppointmentRow & { email: string; full_name: string }>(
    `select a.*, c.email, c.full_name from appointments a join contacts c on c.id = a.contact_id where a.id = $1`,
    [appointmentId],
  );
  if (!a) return;
  const service = await bookingRepo.serviceById(a.service_id, t);
  if (!service) return;
  const location = locationText(service, a);
  const links = calendarLinks(a, service.name, location);
  await enqueueEmail({
    to: a.email,
    template: "booking_confirmed",
    data: {
      name: a.full_name || "there",
      serviceName: service.name,
      when: formatDateTime(a.starts_at, a.customer_timezone),
      location,
      reference: a.reference,
      calendarUrl: links.ics,
      manageUrl: manageToken ? `${env().APP_URL}/book/manage/${manageToken}` : `${env().APP_URL}/portal/appointments`,
      cancellationPolicy: service.cancellation_policy,
    },
    idempotencyKey: `booking-confirmed:${a.id}:${a.reschedule_count}`,
    related: { type: "appointment", id: a.id },
  }, t);
  await enqueue("calendar.sync_appointment", { appointmentId: a.id }, { idempotencyKey: `gcal:${a.id}:${a.reschedule_count}:confirmed` }, t);
}

export async function appointmentByManageToken(token: string) {
  if (!token || token.length > 64) return null;
  return db.one<AppointmentRow>("select * from appointments where manage_token_hash = $1", [hashToken(token)]);
}

type Actor = { kind: "customer"; userId?: string | null } | { kind: "admin"; userId: string; override?: boolean };

export async function cancelAppointment(appointmentId: string, actor: Actor, reason: string): Promise<{ refundRequested: boolean }> {
  let refundOrderId: string | null = null;
  let refundAmount = 0;
  const out = await tx(async (t) => {
    const a = await t.one<AppointmentRow>("select * from appointments where id = $1 for update", [appointmentId]);
    if (!a) throw new BookingError("Booking not found.");
    if (!["confirmed", "pending_payment"].includes(a.status)) throw new BookingError("This booking can't be cancelled.");
    const service = (await bookingRepo.serviceById(a.service_id, t))!;
    const inCutoff = withinCustomerCutoff(a.starts_at, service.cancel_cutoff_hours);
    if (actor.kind === "customer" && !inCutoff) {
      throw new BookingError(`Bookings can be cancelled online up to ${service.cancel_cutoff_hours} hours before the start time. Please contact us.`);
    }
    await t.query(
      `update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 where id = $1`,
      [a.id, actor.kind, reason.slice(0, 500)],
    );
    let refundRequested = false;
    if (a.order_id && a.status === "confirmed") {
      const order = await t.one<{ id: string; status: string; total_minor: number; refunded_minor: number }>("select id, status, total_minor, refunded_minor from orders where id = $1", [a.order_id]);
      const eligible = service.refund_on_cancel && (inCutoff || (actor.kind === "admin"));
      if (order && order.status === "paid" && eligible && order.total_minor - order.refunded_minor > 0) {
        refundOrderId = order.id;
        refundAmount = order.total_minor - order.refunded_minor;
        refundRequested = true;
      }
    }
    await logActivity(t, a.contact_id, "booking", `Booking ${a.reference} cancelled by ${actor.kind}`, { body: reason, actorId: actor.kind === "admin" ? actor.userId : null });
    await audit({ actorId: actor.userId ?? null, actorLabel: actor.kind, action: "appointment.cancel", entityType: "appointment", entityId: a.id, data: { reason, override: actor.kind === "admin" ? actor.override : false } }, t);
    const contact = await t.one<{ email: string; full_name: string }>("select email, full_name from contacts where id = $1", [a.contact_id]);
    if (contact?.email) {
      await enqueueEmail({
        to: contact.email,
        template: "booking_cancelled",
        data: {
          name: contact.full_name || "there",
          serviceName: service.name,
          when: formatDateTime(a.starts_at, a.customer_timezone),
          refundNote: refundRequested ? "A refund has been initiated to your original payment method." : "",
          bookUrl: `${env().APP_URL}/book`,
        },
        idempotencyKey: `booking-cancelled:${a.id}`,
        related: { type: "appointment", id: a.id },
      }, t);
    }
    await enqueue("calendar.sync_appointment", { appointmentId: a.id }, { idempotencyKey: `gcal:${a.id}:cancelled` }, t);
    return { refundRequested };
  });
  if (refundOrderId) {
    await requestRefund({ orderId: refundOrderId, amountMinor: refundAmount, reason: `Booking cancelled: ${reason}`, actorId: actor.kind === "admin" ? actor.userId : null });
  }
  return out;
}

export async function rescheduleAppointment(appointmentId: string, newStartIso: string, actor: Actor): Promise<void> {
  const current = await db.one<AppointmentRow>("select * from appointments where id = $1", [appointmentId]);
  if (!current || current.status !== "confirmed") throw new BookingError("Only confirmed bookings can be rescheduled.");
  const service = (await bookingRepo.serviceById(current.service_id))!;
  if (actor.kind === "customer") {
    if (!withinCustomerCutoff(current.starts_at, service.reschedule_cutoff_hours)) {
      throw new BookingError(`Bookings can be rescheduled online up to ${service.reschedule_cutoff_hours} hours before the start time.`);
    }
    if (current.reschedule_count >= service.max_reschedules) throw new BookingError("This booking has reached its reschedule limit. Please contact us.");
  }
  const start = new Date(newStartIso);
  if (Number.isNaN(start.getTime())) throw new BookingError("Please choose a valid time.");
  const tz = await businessTz();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(start);
  if (!(actor.kind === "admin" && actor.override)) {
    const slots = await availableSlots(service, day, { ignoreSlotGroup: current.slot_group });
    if (!slots.some((s) => s.start.getTime() === start.getTime())) throw new BookingError("That time isn't available.");
  }
  const range = blockRange(toRules(service), start);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  await tx(async (t) => {
    const a = await t.one<AppointmentRow>("select * from appointments where id = $1 for update", [appointmentId]);
    if (!a || a.status !== "confirmed") throw new BookingError("Only confirmed bookings can be rescheduled.");
    const slotGroup = service.capacity > 1 ? groupSlotKey(service.id, start) : a.id;
    try {
      await t.query("savepoint resched");
      await t.query(
        `update appointments set starts_at = $2, ends_at = $3, block_range = tstzrange($4, $5), slot_group = $6,
           reschedule_count = reschedule_count + 1, reminder_24h_sent_at = null, reminder_1h_sent_at = null where id = $1`,
        [a.id, start, end, range.start, range.end, slotGroup],
      );
      await t.query("release savepoint resched");
    } catch (error) {
      await t.query("rollback to savepoint resched");
      mapBookingDbError(error);
    }
    await audit({ actorId: actor.userId ?? null, actorLabel: actor.kind, action: "appointment.reschedule", entityType: "appointment", entityId: a.id, data: { from: a.starts_at, to: start } }, t);
    await logActivity(t, a.contact_id, "booking", `Booking ${a.reference} rescheduled to ${formatDateTime(start, tz)}`);
    const contact = await t.one<{ email: string; full_name: string }>("select email, full_name from contacts where id = $1", [a.contact_id]);
    if (contact?.email) {
      const links = calendarLinks({ id: a.id, starts_at: start, ends_at: end }, service.name, locationText(service, a));
      await enqueueEmail({
        to: contact.email,
        template: "booking_rescheduled",
        data: { name: contact.full_name || "there", serviceName: service.name, when: formatDateTime(start, a.customer_timezone), calendarUrl: links.ics, manageUrl: `${env().APP_URL}/portal/appointments` },
        idempotencyKey: `booking-rescheduled:${a.id}:${a.reschedule_count + 1}`,
        related: { type: "appointment", id: a.id },
      }, t);
    }
    await enqueue("calendar.sync_appointment", { appointmentId: a.id }, { idempotencyKey: `gcal:${a.id}:${a.reschedule_count + 1}:resched` }, t);
  });
}

/** Admin-created booking (phone/WhatsApp/in-person arrangements). Payment can be recorded separately. */
export async function adminCreateAppointment(input: {
  serviceId: string; startsAt: string; email: string; fullName: string; phone?: string; notes?: string; actorId: string; override: boolean; meetingUrl?: string;
}): Promise<string> {
  const service = await bookingRepo.serviceById(input.serviceId);
  if (!service) throw new BookingError("Service not found.");
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new BookingError("Invalid start time.");
  const range = blockRange(toRules(service), start);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const tz = await businessTz();
  const manageToken = randomToken(24);
  return tx(async (t) => {
    await bookingRepo.expireStaleHolds(t);
    const { id: contactId } = await upsertContact(t, { email: input.email, fullName: input.fullName, phone: input.phone || null, source: "manual" });
    const id = (await t.one<{ id: string }>("select gen_random_uuid() as id"))!.id;
    const slotGroup = service.capacity > 1 ? groupSlotKey(service.id, start) : id;
    try {
      await t.query("savepoint admin_appt");
      await t.query(
        `insert into appointments (id, reference, service_id, contact_id, starts_at, ends_at, block_range, slot_group, status,
           customer_timezone, internal_notes, meeting_url, manage_token_hash, created_by_admin)
         values ($1,$2,$3,$4,$5,$6,tstzrange($7,$8),$9,'confirmed',$10,$11,$12,$13,$14)`,
        [id, humanReference("BK"), service.id, contactId, start, end, range.start, range.end, slotGroup, tz,
         input.notes ?? "", input.meetingUrl || service.default_meeting_url, hashToken(manageToken), input.actorId],
      );
      await t.query("release savepoint admin_appt");
    } catch (error) {
      await t.query("rollback to savepoint admin_appt");
      mapBookingDbError(error);
    }
    await audit({ actorId: input.actorId, action: "appointment.admin_create", entityType: "appointment", entityId: id, data: { override: input.override } }, t);
    await logActivity(t, contactId, "booking", `Appointment created by admin: ${service.name}`, { actorId: input.actorId });
    await sendBookingConfirmation(t, id, manageToken);
    return id;
  });
}
