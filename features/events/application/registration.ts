import "server-only";
import { UserError } from "@/lib/errors";
import { db, tx, type Db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { humanReference, signValue } from "@/lib/security/crypto";
import { isUniqueViolation, raisedToken } from "@/lib/database/errors";
import { formatDateTime } from "@/lib/time";
import { enqueue } from "@/lib/jobs/queue";
import { upsertContact, logActivity } from "@/features/crm/application/contacts";
import { enqueueEmail } from "@/features/notifications/application/send";
import { paymentsReady } from "@/features/payments/application/gateway";
import { PaymentsNotConfiguredError } from "@/features/payments/domain/gateway";
import { completeFreeOrderIfZero, createOrder, holdMinutes, startPayment } from "@/features/commerce/application/checkout";
import { registrationState, ticketOnSale } from "../domain/rules";
import { eventRepo, remainingFor, type EventRow, type TicketRow } from "../infrastructure/repository";

export class EventError extends UserError {}

const FORMAT_LABEL = { online: "Online", in_person: "In person", hybrid: "Hybrid (online & in person)" } as const;

function mapCapacityError(error: unknown, remaining: number | null): never {
  const token = raisedToken(error);
  if (token === "EVENT_SOLD_OUT" || token === "TICKET_SOLD_OUT") {
    throw new EventError(remaining && remaining > 0 ? `Only ${remaining} place(s) left. Please reduce the quantity.` : "Sorry, this is now sold out.");
  }
  if (isUniqueViolation(error)) throw new EventError("This email address is already registered for this event.");
  throw error;
}

export type RegistrationRequest = {
  eventSlug: string;
  ticketTypeId: string;
  buyer: { fullName: string; email: string; phone?: string; consentMarketing?: boolean };
  /** One entry per seat. The first attendee defaults to the buyer. */
  attendees: { fullName: string; email: string }[];
  discountCode?: string;
  userId?: string | null;
  attribution?: Record<string, unknown>;
};

export type RegistrationOutcome =
  | { kind: "confirmed"; reference: string }
  | { kind: "payment"; reference: string; authorizationUrl: string };

export async function registerForEvent(req: RegistrationRequest): Promise<RegistrationOutcome> {
  const event = await eventRepo.bySlug(req.eventSlug);
  if (!event) throw new EventError("Event not found.");
  const state = registrationState(event);
  if (state !== "open") {
    throw new EventError(state === "not_open" ? "Registration hasn't opened yet." : state === "cancelled" ? "This event has been cancelled." : "Registration is closed.");
  }
  const ticket = (await eventRepo.tickets(event.id)).find((t) => t.id === req.ticketTypeId);
  if (!ticket || !ticketOnSale(ticket)) throw new EventError("This ticket is not available.");
  const quantity = req.attendees.length;
  if (quantity < 1 || quantity > ticket.max_per_order) throw new EventError(`You can register between 1 and ${ticket.max_per_order} people per order.`);
  const paid = ticket.price_minor > 0;
  if (paid && !(await paymentsReady())) throw new PaymentsNotConfiguredError();

  const counts = await eventRepo.seatCounts(event.id);
  const remaining = remainingFor(event, ticket, counts);
  if (remaining !== null && remaining < quantity) {
    throw new EventError(remaining === 0 ? "Sorry, this is sold out." : `Only ${remaining} place(s) left.`);
  }

  const hold = await holdMinutes();
  const expiresAt = new Date(Date.now() + hold * 60_000);
  const reference = humanReference("REG");

  const outcome = await tx(async (t) => {
    const buyer = await upsertContact(t, {
      email: req.buyer.email, fullName: req.buyer.fullName, phone: req.buyer.phone || null, source: "event_registration",
      attribution: req.attribution, consentMarketing: req.buyer.consentMarketing, consentSource: `event:${event.slug}`,
    });
    let orderId: string | null = null;
    let order = null;
    if (paid) {
      const created = await createOrder(t, {
        customer: { email: req.buyer.email, fullName: req.buyer.fullName, phone: req.buyer.phone },
        userId: req.userId,
        items: [{ itemType: "event_ticket", itemId: ticket.id, description: `${event.title} — ${ticket.name}`, quantity, unitPriceMinor: ticket.price_minor, currency: ticket.currency, metadata: { eventId: event.id } }],
        discountCode: req.discountCode,
        attribution: req.attribution,
        expiresAt,
      });
      order = created.order;
      orderId = order.id;
    }
    try {
      await t.query("savepoint seats");
      for (const [i, a] of req.attendees.entries()) {
        const attendee = i === 0 && a.email.toLowerCase() === req.buyer.email.toLowerCase()
          ? buyer
          : await upsertContact(t, { email: a.email, fullName: a.fullName, source: "event_registration" });
        await t.query(
          `insert into event_registrations (reference, event_id, ticket_type_id, contact_id, user_id, order_id, attendee_name, attendee_email,
              status, source, hold_expires_at, attribution)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'online',$10,$11)`,
          [quantity > 1 ? `${reference}-${i + 1}` : reference, event.id, ticket.id, attendee.id, i === 0 ? req.userId ?? null : null, orderId,
           a.fullName, a.email.toLowerCase(), paid ? "reserved" : "confirmed", paid ? expiresAt : null, JSON.stringify(req.attribution ?? {})],
        );
      }
      await t.query("release savepoint seats");
    } catch (error) {
      await t.query("rollback to savepoint seats");
      mapCapacityError(error, remaining);
    }
    await logActivity(t, buyer.id, "registration", `Registered for ${event.title} (${quantity} × ${ticket.name})`, { data: { eventId: event.id, orderId } });
    if (!paid) {
      await sendRegistrationConfirmations(t, event, { reference });
      return { kind: "confirmed" as const };
    }
    if (order && (await completeFreeOrderIfZero(t, order))) return { kind: "confirmed" as const };
    return { kind: "pending" as const, orderId: orderId! };
  });

  if (outcome.kind === "confirmed") return { kind: "confirmed", reference };
  const { authorizationUrl } = await startPayment(outcome.orderId);
  return { kind: "payment", reference, authorizationUrl };
}

/** Sends confirmations for confirmed registrations matching an order or reference prefix. */
export async function sendRegistrationConfirmations(t: Db, event: EventRow, by: { orderId?: string; reference?: string }) {
  const regs = await t.query<{ id: string; reference: string; attendee_name: string; attendee_email: string; ticket: string }>(
    `select r.id, r.reference, r.attendee_name, r.attendee_email, tt.name as ticket
       from event_registrations r join ticket_types tt on tt.id = r.ticket_type_id
      where r.status = 'confirmed' and ${by.orderId ? "r.order_id = $1" : "(r.reference = $1 or r.reference like $1 || '-%')"}`,
    [by.orderId ?? by.reference],
  );
  const icsToken = signValue(`event:${event.id}`, Math.floor(event.ends_at.getTime() / 1000) + 30 * 86400);
  for (const r of regs) {
    await enqueueEmail({
      to: r.attendee_email,
      template: "event_registration_confirmed",
      data: {
        name: r.attendee_name || "there",
        eventTitle: event.title,
        when: formatDateTime(event.starts_at, event.timezone),
        format: FORMAT_LABEL[event.format],
        ticket: r.ticket,
        reference: r.reference,
        calendarUrl: `${env().APP_URL}/api/ics/${icsToken}`,
        portalUrl: `${env().APP_URL}/portal/events/${event.id}`,
      },
      idempotencyKey: `event-confirmed:${r.id}`,
      related: { type: "event_registration", id: r.id },
    }, t);
  }
}

export async function joinWaitlist(input: { eventSlug: string; email: string; fullName: string; consentMarketing?: boolean }) {
  const event = await eventRepo.bySlug(input.eventSlug);
  if (!event || !event.waitlist_enabled || event.status !== "published") throw new EventError("The waiting list isn't available.");
  await tx(async (t) => {
    const c = await upsertContact(t, { email: input.email, fullName: input.fullName, source: "event_waitlist", consentMarketing: input.consentMarketing, consentSource: `waitlist:${event.slug}` });
    await t.query(
      `insert into event_waitlist (event_id, contact_id, email, full_name) values ($1,$2,$3,$4) on conflict (event_id, email) do nothing`,
      [event.id, c.id, input.email.toLowerCase(), input.fullName],
    );
    await logActivity(t, c.id, "registration", `Joined waiting list for ${event.title}`);
  });
}

/** Job: when seats free up, notify the next people on the waiting list. */
export async function offerWaitlistSeats(eventId: string): Promise<number> {
  const event = await eventRepo.byId(eventId);
  if (!event || registrationState(event) !== "open") return 0;
  const counts = await eventRepo.seatCounts(eventId);
  const free = event.capacity === null ? 0 : event.capacity - counts.total;
  if (free <= 0) return 0;
  const waiting = await db.query<{ id: string; email: string; full_name: string }>(
    `update event_waitlist set status = 'notified', notified_at = now()
      where id in (select id from event_waitlist where event_id = $1 and status = 'waiting' order by created_at limit $2)
      returning id, email, full_name`,
    [eventId, free],
  );
  for (const w of waiting) {
    await enqueueEmail({
      to: w.email,
      template: "waitlist_spot",
      data: { name: w.full_name || "there", eventTitle: event.title, eventUrl: `${env().APP_URL}/masterclasses/${event.slug}` },
      idempotencyKey: `waitlist:${w.id}`,
    });
  }
  return waiting.length;
}

export async function scheduleWaitlistCheck(t: Db, eventId: string) {
  await enqueue("events.waitlist_offer", { eventId }, { idempotencyKey: `waitlist-offer:${eventId}:${Math.floor(Date.now() / 60000)}` }, t);
}

export type PublicTicket = TicketRow & { remaining: number | null; onSale: boolean };

export async function publicTickets(event: EventRow): Promise<PublicTicket[]> {
  const [tickets, counts] = await Promise.all([eventRepo.tickets(event.id), eventRepo.seatCounts(event.id)]);
  return tickets
    .filter((t) => t.visibility === "public")
    .map((t) => ({ ...t, remaining: remainingFor(event, t, counts), onSale: ticketOnSale(t) }));
}
