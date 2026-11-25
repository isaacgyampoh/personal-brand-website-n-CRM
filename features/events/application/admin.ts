import "server-only";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { env } from "@/lib/config/env";
import { UserError } from "@/lib/errors";
import { humanReference, signValue } from "@/lib/security/crypto";
import { raisedToken } from "@/lib/database/errors";
import { formatDateTime } from "@/lib/time";
import { parseMajorToMinor } from "@/lib/money";
import { docFromText, isRichDoc } from "@/features/content/domain/rich-text";
import { upsertContact, logActivity } from "@/features/crm/application/contacts";
import { enqueueEmail } from "@/features/notifications/application/send";
import { requestRefund } from "@/features/commerce/application/refunds";
import { issueCertificate } from "@/features/academy/application/certificates";
import { sendRegistrationConfirmations } from "./registration";
import { eventRepo } from "../infrastructure/repository";

export class EventAdminError extends UserError {}

const pipeLines = (text: string, n: number) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split("|").map((p) => p.trim());
    while (parts.length < n) parts.push("");
    return parts;
  });

export const eventInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  slug: z.string().trim().max(100).default(""),
  subtitle: z.string().trim().max(250).default(""),
  kind: z.enum(["masterclass", "webinar", "workshop", "group_coaching", "programme", "conference", "other"]),
  format: z.enum(["online", "in_person", "hybrid"]),
  summary: z.string().trim().max(600).default(""),
  description: z.string().max(30000).default(""),
  coverMediaId: z.union([z.literal(""), z.string().uuid()]).default(""),
  flyerMediaId: z.union([z.literal(""), z.string().uuid()]).default(""),
  venueName: z.string().trim().max(200).default(""),
  venueAddress: z.string().trim().max(400).default(""),
  timezone: z.string().default("Africa/Accra"),
  startsAt: z.date(),
  endsAt: z.date(),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]).default(""),
  registrationOpensAt: z.date().nullable(),
  registrationClosesAt: z.date().nullable(),
  waitlistEnabled: z.boolean(),
  certificateEnabled: z.boolean(),
  feedbackEnabled: z.boolean(),
  speakers: z.string().max(5000).default(""),
  agenda: z.string().max(5000).default(""),
  faqs: z.string().max(10000).default(""),
  seoTitle: z.string().max(80).default(""),
  seoDescription: z.string().max(300).default(""),
});

export async function saveEvent(id: string | null, raw: unknown, actorId: string): Promise<string> {
  const i = eventInput.parse(raw);
  if (i.endsAt <= i.startsAt) throw new EventAdminError("The end time must be after the start time.");
  const slug = slugify(i.slug || i.title);
  const desc = (() => { try { const j = JSON.parse(i.description); return isRichDoc(j) ? j : docFromText(i.description); } catch { return docFromText(i.description); } })();
  const speakers = pipeLines(i.speakers, 4).map(([name, title, bio, photoUrl]) => ({ name, title, bio, photoUrl: /^(https:\/\/|\/)/.test(photoUrl) ? photoUrl : "" }));
  const agenda = pipeLines(i.agenda, 3).map(([time, title, description]) => ({ time, title, description }));
  const faqs = pipeLines(i.faqs, 2).map(([q, a]) => ({ q, a })).filter((f) => f.q && f.a);
  const vals = [slug, i.title, i.subtitle, i.kind, i.format, i.summary, JSON.stringify(desc), i.coverMediaId || null, i.flyerMediaId || null,
    i.venueName, i.venueAddress, i.timezone, i.startsAt, i.endsAt, i.capacity === "" ? null : i.capacity, i.registrationOpensAt, i.registrationClosesAt,
    i.waitlistEnabled, JSON.stringify(speakers), JSON.stringify(agenda), JSON.stringify(faqs), i.certificateEnabled, i.feedbackEnabled,
    JSON.stringify({ title: i.seoTitle, description: i.seoDescription })];
  try {
    if (id) {
      const prev = await db.one<{ starts_at: Date; status: string }>("select starts_at, status from events where id = $1", [id]);
      if (prev && prev.status === "published" && prev.starts_at.getTime() !== i.startsAt.getTime()) {
        throw new EventAdminError("To change the date of a published event, use “Reschedule” so attendees are notified.");
      }
      await db.query(
        `update events set slug=$1,title=$2,subtitle=$3,kind=$4,format=$5,summary=$6,description=$7,cover_media_id=$8,flyer_media_id=$9,venue_name=$10,
           venue_address=$11,timezone=$12,starts_at=$13,ends_at=$14,capacity=$15,registration_opens_at=$16,registration_closes_at=$17,waitlist_enabled=$18,
           speakers=$19,agenda=$20,faqs=$21,certificate_enabled=$22,feedback_enabled=$23,seo=$24 where id=$25`,
        [...vals, id],
      );
    } else {
      const r = await db.one<{ id: string }>(
        `insert into events (slug,title,subtitle,kind,format,summary,description,cover_media_id,flyer_media_id,venue_name,venue_address,timezone,starts_at,ends_at,
           capacity,registration_opens_at,registration_closes_at,waitlist_enabled,speakers,agenda,faqs,certificate_enabled,feedback_enabled,seo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
        vals,
      );
      id = r!.id;
      await db.query("insert into event_access (event_id) values ($1) on conflict do nothing", [id]);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new EventAdminError("Another event already uses that URL slug.");
    if (raisedToken(e) === "EVENT_SOLD_OUT") throw new EventAdminError("Capacity can't be lower than the number of seats already sold.");
    throw e;
  }
  await audit({ actorId, action: "event.save", entityType: "event", entityId: id });
  return id!;
}

export async function setEventStatus(id: string, action: "publish" | "unpublish", actorId: string) {
  if (action === "publish") {
    const tickets = await db.one<{ n: number }>("select count(*)::int as n from ticket_types where event_id = $1", [id]);
    if (!tickets?.n) throw new EventAdminError("Add at least one ticket type (it can be free) before publishing.");
    const r = await db.query(`update events set status = 'published', published_at = coalesce(published_at, now()) where id = $1 and status in ('draft','published') returning id`, [id]);
    if (!r.length) throw new EventAdminError("Only draft events can be published.");
  } else {
    const regs = await db.one<{ n: number }>("select count(*)::int as n from event_registrations where event_id = $1 and status in ('confirmed','reserved')", [id]);
    if (regs?.n) throw new EventAdminError("This event has registrations. Cancel it instead so attendees are notified and refunded.");
    await db.query(`update events set status = 'draft' where id = $1 and status = 'published'`, [id]);
  }
  await audit({ actorId, action: `event.${action}`, entityType: "event", entityId: id });
}

// ---------------- Tickets ----------------
export const ticketInput = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).default(""),
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).default(""),
  price: z.string().default("0"),
  currency: z.string().length(3).default("GHS"),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(1)]).default(""),
  salesStartAt: z.date().nullable(),
  salesEndAt: z.date().nullable(),
  maxPerOrder: z.coerce.number().int().min(1).max(50).default(10),
  visibility: z.enum(["public", "hidden", "complimentary"]).default("public"),
  position: z.coerce.number().int().default(0),
});

export async function saveTicket(raw: unknown, actorId: string) {
  const i = ticketInput.parse(raw);
  const price = parseMajorToMinor(i.price || "0", i.currency);
  const vals = [i.name, i.description, price, i.currency.toUpperCase(), i.capacity === "" ? null : i.capacity, i.salesStartAt, i.salesEndAt, i.maxPerOrder, i.visibility, i.position];
  if (i.id) {
    const sold = await db.one<{ n: number; price_minor: number }>(
      "select (select count(*) from event_registrations where ticket_type_id = $1 and status in ('confirmed','reserved'))::int as n, price_minor from ticket_types where id = $1", [i.id]);
    if (sold && sold.n > 0 && sold.price_minor !== price) throw new EventAdminError("This ticket has sales; create a new ticket type for a different price.");
    await db.query(
      `update ticket_types set name=$1,description=$2,price_minor=$3,currency=$4,capacity=$5,sales_start_at=$6,sales_end_at=$7,max_per_order=$8,visibility=$9,position=$10 where id=$11 and event_id=$12`,
      [...vals, i.id, i.eventId],
    );
  } else {
    await db.query(
      `insert into ticket_types (name,description,price_minor,currency,capacity,sales_start_at,sales_end_at,max_per_order,visibility,position,event_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [...vals, i.eventId],
    );
  }
  await audit({ actorId, action: "event.ticket", entityType: "event", entityId: i.eventId, data: { name: i.name, price } });
}

export async function deleteTicket(id: string, actorId: string) {
  const used = await db.one("select 1 from event_registrations where ticket_type_id = $1", [id]);
  if (used) throw new EventAdminError("Tickets with registrations can't be deleted. Hide it instead.");
  await db.query("delete from ticket_types where id = $1", [id]);
  await audit({ actorId, action: "event.ticket_delete", entityType: "ticket", entityId: id });
}

// ---------------- Access, sessions, resources ----------------
export async function saveAccess(eventId: string, input: { provider: string; url: string; meetingId: string; passcode: string; instructions: string; opensMinutesBefore: number }, actorId: string) {
  if (input.url && !/^https:\/\//.test(input.url)) throw new EventAdminError("Meeting link must start with https://");
  await db.query(
    `insert into event_access (event_id, meeting_provider, meeting_url, meeting_id, passcode, instructions, access_opens_minutes_before, updated_at)
     values ($1,$2,nullif($3,''),nullif($4,''),nullif($5,''),$6,$7, now())
     on conflict (event_id) do update set meeting_provider=excluded.meeting_provider, meeting_url=excluded.meeting_url, meeting_id=excluded.meeting_id,
       passcode=excluded.passcode, instructions=excluded.instructions, access_opens_minutes_before=excluded.access_opens_minutes_before, updated_at=now()`,
    [eventId, input.provider, input.url, input.meetingId, input.passcode, input.instructions, input.opensMinutesBefore],
  );
  await audit({ actorId, action: "event.access", entityType: "event", entityId: eventId });
}

export async function addSessions(eventId: string, input: { title: string; startsAt: Date; durationMinutes: number; repeatWeeks: number }, actorId: string) {
  if (input.repeatWeeks < 1 || input.repeatWeeks > 52) throw new EventAdminError("Repeat between 1 and 52 times.");
  await tx(async (t) => {
    for (let w = 0; w < input.repeatWeeks; w++) {
      const s = new Date(input.startsAt.getTime() + w * 7 * 86400_000);
      await t.query(
        "insert into event_sessions (event_id, title, starts_at, ends_at, position) values ($1,$2,$3,$4,$5)",
        [eventId, input.repeatWeeks > 1 ? `${input.title || "Session"} ${w + 1}` : input.title || "Session", s, new Date(s.getTime() + input.durationMinutes * 60_000), w],
      );
    }
    // Keep the event's overall window covering all sessions.
    await t.query(
      `update events e set starts_at = least(e.starts_at, x.mn), ends_at = greatest(e.ends_at, x.mx)
         from (select min(starts_at) mn, max(ends_at) mx from event_sessions where event_id = $1) x where e.id = $1 and e.status = 'draft'`,
      [eventId],
    );
    await audit({ actorId, action: "event.sessions", entityType: "event", entityId: eventId, data: input }, t);
  });
}

export async function addResource(eventId: string, input: { kind: "recording" | "slides" | "download" | "link"; title: string; mediaId: string; url: string; availableFrom: Date | null }, actorId: string) {
  if (!input.mediaId && !/^https:\/\//.test(input.url)) throw new EventAdminError("Choose a file or enter an https:// link.");
  await db.query(
    "insert into event_resources (event_id, kind, title, media_id, url, available_from) values ($1,$2,$3,nullif($4,'')::uuid,nullif($5,''),$6)",
    [eventId, input.kind, input.title || input.kind, input.mediaId, input.url, input.availableFrom],
  );
  await audit({ actorId, action: "event.resource", entityType: "event", entityId: eventId });
}

// ---------------- Duplicate / reschedule / cancel ----------------
export async function duplicateEvent(id: string, actorId: string): Promise<string> {
  return tx(async (t) => {
    const src = await t.one<{ slug: string; starts_at: Date; ends_at: Date }>("select slug, starts_at, ends_at from events where id = $1", [id]);
    if (!src) throw new EventAdminError("Event not found.");
    const shift = Math.max(0, Math.ceil((Date.now() - src.starts_at.getTime()) / (7 * 86400_000))) * 7 * 86400_000 + 7 * 86400_000;
    const slug = `${src.slug}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`.slice(0, 95);
    const copy = await t.one<{ id: string }>(
      `insert into events (slug,title,subtitle,kind,format,summary,description,cover_media_id,flyer_media_id,venue_name,venue_address,timezone,starts_at,ends_at,
          capacity,waitlist_enabled,speakers,agenda,faqs,certificate_enabled,feedback_enabled,seo,status,duplicated_from)
       select $2,title || ' (copy)',subtitle,kind,format,summary,description,cover_media_id,flyer_media_id,venue_name,venue_address,timezone,
          starts_at + make_interval(secs => $3), ends_at + make_interval(secs => $3), capacity,waitlist_enabled,speakers,agenda,faqs,certificate_enabled,feedback_enabled,seo,'draft',id
       from events where id = $1 returning id`,
      [id, slug, shift / 1000],
    );
    await t.query(
      `insert into ticket_types (event_id,name,description,price_minor,currency,capacity,max_per_order,visibility,position)
       select $2,name,description,price_minor,currency,capacity,max_per_order,visibility,position from ticket_types where event_id = $1`,
      [id, copy!.id],
    );
    await t.query(
      `insert into event_sessions (event_id,title,starts_at,ends_at,position) select $2,title,starts_at + make_interval(secs => $3),ends_at + make_interval(secs => $3),position from event_sessions where event_id = $1`,
      [id, copy!.id, shift / 1000],
    );
    await t.query(
      `insert into event_access (event_id, meeting_provider, instructions, access_opens_minutes_before) select $2, meeting_provider, instructions, access_opens_minutes_before from event_access where event_id = $1`,
      [id, copy!.id],
    );
    await audit({ actorId, action: "event.duplicate", entityType: "event", entityId: copy!.id, data: { from: id } }, t);
    return copy!.id;
  });
}

async function confirmedAttendees(eventId: string) {
  return db.query<{ id: string; attendee_email: string; attendee_name: string }>(
    "select id, attendee_email, attendee_name from event_registrations where event_id = $1 and status = 'confirmed'",
    [eventId],
  );
}

export async function rescheduleEvent(id: string, startsAt: Date, endsAt: Date, actorId: string) {
  if (endsAt <= startsAt) throw new EventAdminError("End must be after start.");
  const event = await tx(async (t) => {
    const e = await t.one<{ starts_at: Date; title: string; timezone: string; status: string }>("select starts_at, title, timezone, status from events where id = $1 for update", [id]);
    if (!e || e.status === "cancelled") throw new EventAdminError("Event not found or cancelled.");
    const shift = (startsAt.getTime() - e.starts_at.getTime()) / 1000;
    await t.query("update events set starts_at = $2, ends_at = $3 where id = $1", [id, startsAt, endsAt]);
    await t.query("update event_sessions set starts_at = starts_at + make_interval(secs => $2), ends_at = ends_at + make_interval(secs => $2) where event_id = $1", [id, shift]);
    await t.query("update event_registrations set reminder_24h_sent_at = null, reminder_1h_sent_at = null where event_id = $1", [id]);
    await audit({ actorId, action: "event.reschedule", entityType: "event", entityId: id, data: { from: e.starts_at, to: startsAt } }, t);
    return e;
  });
  const ics = signValue(`event:${id}`, Math.floor(endsAt.getTime() / 1000) + 30 * 86400);
  for (const r of await confirmedAttendees(id)) {
    await enqueueEmail({
      to: r.attendee_email, template: "event_rescheduled",
      data: { name: r.attendee_name || "there", eventTitle: event.title, when: formatDateTime(startsAt, event.timezone), calendarUrl: `${env().APP_URL}/api/ics/${ics}`, portalUrl: `${env().APP_URL}/portal/events/${id}` },
      idempotencyKey: `event-resched:${r.id}:${startsAt.toISOString()}`,
    });
  }
}

/** Cancels the event, cancels registrations, refunds paid orders in full and notifies attendees. */
export async function cancelEvent(id: string, reason: string, actorId: string): Promise<{ refunds: number; notified: number }> {
  const { event, regs, orders } = await tx(async (t) => {
    const e = await t.one<{ title: string; starts_at: Date; timezone: string; status: string }>("select title, starts_at, timezone, status from events where id = $1 for update", [id]);
    if (!e) throw new EventAdminError("Event not found.");
    if (e.status === "cancelled") throw new EventAdminError("Already cancelled.");
    await t.query("update events set status = 'cancelled', cancellation_reason = $2 where id = $1", [id, reason.slice(0, 500)]);
    const regs = await t.query<{ id: string; attendee_email: string; attendee_name: string; order_id: string | null }>(
      "update event_registrations set status = 'cancelled' where event_id = $1 and status in ('confirmed','reserved') returning id, attendee_email, attendee_name, order_id", [id]);
    await t.query("update event_waitlist set status = 'removed' where event_id = $1 and status = 'waiting'", [id]);
    const orders = await t.query<{ id: string; refundable: number }>(
      `select distinct o.id, (o.total_minor - o.refunded_minor)::bigint as refundable from orders o join event_registrations r on r.order_id = o.id
        where r.event_id = $1 and o.status in ('paid','partially_refunded') and o.total_minor - o.refunded_minor > 0`, [id]);
    // Unpaid holds on pending orders are cancelled so they can't be paid later.
    await t.query(
      `update orders set status = 'cancelled' where status in ('pending','failed') and id in (select order_id from event_registrations where event_id = $1 and order_id is not null)`, [id]);
    await audit({ actorId, action: "event.cancel", entityType: "event", entityId: id, data: { reason, registrations: regs.length, refunds: orders.length } }, t);
    return { event: e, regs, orders };
  });
  for (const o of orders) {
    await requestRefund({ orderId: o.id, amountMinor: o.refundable, reason: `Event cancelled: ${event.title}`, actorId, idempotencyKey: `event-cancel:${id}:${o.id}` });
  }
  const paidOrders = new Set(orders.map((o) => o.id));
  for (const r of regs) {
    await enqueueEmail({
      to: r.attendee_email, template: "event_cancelled",
      data: { name: r.attendee_name || "there", eventTitle: event.title, when: formatDateTime(event.starts_at, event.timezone), reason, refundNote: r.order_id && paidOrders.has(r.order_id) ? "A full refund has been initiated to your original payment method." : "" },
      idempotencyKey: `event-cancelled:${r.id}`,
    });
  }
  return { refunds: orders.length, notified: regs.length };
}

// ---------------- Attendees ----------------
export async function manualRegistration(input: { eventId: string; ticketTypeId: string; fullName: string; email: string; source: "manual" | "complimentary"; note: string }, actorId: string) {
  const event = await eventRepo.byId(input.eventId);
  if (!event) throw new EventAdminError("Event not found.");
  await tx(async (t) => {
    const c = await upsertContact(t, { email: input.email, fullName: input.fullName, source: `event:${input.source}` });
    const reference = humanReference("REG");
    try {
      await t.query("savepoint man");
      await t.query(
        `insert into event_registrations (reference, event_id, ticket_type_id, contact_id, attendee_name, attendee_email, status, source)
         values ($1,$2,$3,$4,$5,$6,'confirmed',$7)`,
        [reference, input.eventId, input.ticketTypeId, c.id, input.fullName, input.email.toLowerCase(), input.source],
      );
      await t.query("release savepoint man");
    } catch (e) {
      await t.query("rollback to savepoint man");
      const tok = raisedToken(e);
      if (tok === "EVENT_SOLD_OUT" || tok === "TICKET_SOLD_OUT") throw new EventAdminError("The event is at capacity. Increase capacity first.");
      if ((e as { code?: string }).code === "23505") throw new EventAdminError("That email is already registered.");
      throw e;
    }
    await logActivity(t, c.id, "registration", `${input.source === "complimentary" ? "Complimentary" : "Manual"} registration: ${event.title}`, { body: input.note, actorId });
    await audit({ actorId, action: "event.manual_registration", entityType: "event", entityId: input.eventId, data: { email: input.email, source: input.source } }, t);
    await sendRegistrationConfirmations(t, event, { reference });
  });
}

export async function checkIn(registrationId: string, attended: boolean, actorId: string) {
  await db.query(
    `update event_registrations set attended_at = case when $2 then coalesce(attended_at, now()) else null end, checked_in_by = $3 where id = $1 and status = 'confirmed'`,
    [registrationId, attended, actorId],
  );
}

export async function attendees(eventId: string) {
  return db.query<{ id: string; reference: string; attendee_name: string; attendee_email: string; status: string; source: string; ticket: string; attended_at: Date | null; order_reference: string | null; order_status: string | null; created_at: Date; contact_id: string }>(
    `select r.id, r.reference, r.attendee_name, r.attendee_email, r.status, r.source, t.name as ticket, r.attended_at, o.reference as order_reference, o.status as order_status, r.created_at, r.contact_id
       from event_registrations r join ticket_types t on t.id = r.ticket_type_id left join orders o on o.id = r.order_id
      where r.event_id = $1 and r.status <> 'expired' order by r.created_at`,
    [eventId],
  );
}

export async function issueEventCertificates(eventId: string, actorId: string): Promise<number> {
  const e = await db.one<{ title: string; certificate_enabled: boolean; ends_at: Date }>("select title, certificate_enabled, ends_at from events where id = $1", [eventId]);
  if (!e?.certificate_enabled) throw new EventAdminError("Enable certificates for this event first.");
  if (e.ends_at > new Date()) throw new EventAdminError("Certificates can be issued after the event ends.");
  const regs = await db.query<{ contact_id: string; attendee_name: string; attendee_email: string }>(
    "select contact_id, attendee_name, attendee_email from event_registrations where event_id = $1 and status = 'confirmed' and attended_at is not null", [eventId]);
  let n = 0;
  for (const r of regs) {
    const issued = await issueCertificate({ contactId: r.contact_id, eventId, recipientName: r.attendee_name || r.attendee_email, title: e.title, email: r.attendee_email });
    if (issued) n++;
  }
  await audit({ actorId, action: "event.certificates", entityType: "event", entityId: eventId, data: { issued: n } });
  return n;
}
