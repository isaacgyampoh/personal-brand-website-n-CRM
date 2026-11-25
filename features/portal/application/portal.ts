import "server-only";
import { db } from "@/lib/database/pool";
import { storage } from "@/lib/storage";
import { UserError } from "@/lib/errors";
import { joinWindow } from "@/features/events/domain/rules";

export class PortalError extends UserError {}

/** All portal queries are scoped to contacts linked to the user's VERIFIED account. */
export async function portalOverview(userId: string) {
  const [appointments, events, courses, products, orders, certificates] = await Promise.all([
    myAppointments(userId, true), myEvents(userId, true), myCourses(userId), myLibrary(userId),
    db.query("select o.reference from orders o join contacts c on c.id = o.contact_id where c.user_id = $1 limit 1", [userId]),
    db.query("select ce.code from certificates ce join contacts c on c.id = ce.contact_id where c.user_id = $1 and ce.revoked_at is null", [userId]),
  ]);
  return { appointments, events, courses, products, hasOrders: orders.length > 0, certificates: certificates.length };
}

export function myAppointments(userId: string, upcomingOnly = false) {
  return db.query<{ id: string; reference: string; starts_at: Date; ends_at: Date; status: string; service: string; service_slug: string; location_type: string; meeting_url: string | null; meeting_details: string; customer_timezone: string; cancel_cutoff_hours: number; reschedule_cutoff_hours: number; reschedule_count: number; max_reschedules: number }>(
    `select a.id, a.reference, a.starts_at, a.ends_at, a.status, s.name as service, s.slug as service_slug, s.location_type,
            case when a.status = 'confirmed' then a.meeting_url end as meeting_url, a.meeting_details, a.customer_timezone,
            s.cancel_cutoff_hours, s.reschedule_cutoff_hours, a.reschedule_count, s.max_reschedules
       from appointments a join services s on s.id = a.service_id join contacts c on c.id = a.contact_id
      where c.user_id = $1 and a.status in ('confirmed','completed','cancelled','no_show') ${upcomingOnly ? "and a.status = 'confirmed' and a.ends_at > now()" : ""}
      order by a.starts_at desc`,
    [userId],
  );
}

export function myEvents(userId: string, upcomingOnly = false) {
  return db.query<{ id: string; title: string; slug: string; starts_at: Date; ends_at: Date; format: string; status: string; timezone: string; registration_status: string; ticket: string }>(
    `select distinct on (e.id) e.id, e.title, e.slug, e.starts_at, e.ends_at, e.format, e.status, e.timezone, r.status as registration_status, t.name as ticket
       from event_registrations r join events e on e.id = r.event_id join ticket_types t on t.id = r.ticket_type_id join contacts c on c.id = r.contact_id
      where c.user_id = $1 and r.status in ('confirmed','cancelled','refunded') ${upcomingOnly ? "and r.status = 'confirmed' and e.ends_at > now()" : ""}
      order by e.id, r.status = 'confirmed' desc`,
    [userId],
  ).then((rows) => rows.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime()));
}

/**
 * Protected class page data. Meeting details are returned ONLY for a
 * confirmed registration of this user and only inside the access window.
 */
export async function eventAccess(userId: string, eventId: string) {
  const reg = await db.one<{ id: string; status: string; attended_at: Date | null }>(
    `select r.id, r.status, r.attended_at from event_registrations r join contacts c on c.id = r.contact_id
      where r.event_id = $1 and c.user_id = $2 and r.status = 'confirmed' limit 1`,
    [eventId, userId],
  );
  if (!reg) return null;
  const e = await db.one<{ id: string; title: string; slug: string; starts_at: Date; ends_at: Date; format: string; venue_name: string; venue_address: string; timezone: string; status: string; feedback_enabled: boolean; certificate_enabled: boolean }>(
    "select id, title, slug, starts_at, ends_at, format, venue_name, venue_address, timezone, status, feedback_enabled, certificate_enabled from events where id = $1", [eventId]);
  if (!e) return null;
  const access = await db.one<{ meeting_provider: string; meeting_url: string | null; meeting_id: string | null; passcode: string | null; instructions: string; access_opens_minutes_before: number }>(
    "select * from event_access where event_id = $1", [eventId]);
  const sessions = await db.query<{ title: string; starts_at: Date; ends_at: Date }>("select title, starts_at, ends_at from event_sessions where event_id = $1 order by starts_at", [eventId]);
  // For multi-session programmes, the window follows the next session.
  const next = sessions.find((s) => s.ends_at.getTime() + 3 * 3600_000 > Date.now()) ?? { starts_at: e.starts_at, ends_at: e.ends_at };
  const window = e.status === "cancelled" ? "closed" : joinWindow(next.starts_at, next.ends_at, access?.access_opens_minutes_before ?? 30);
  const now = new Date();
  const resources = await Promise.all((await db.query<{ id: string; kind: string; title: string; url: string | null; storage_key: string | null; filename: string | null; available_from: Date | null }>(
    `select r.id, r.kind, r.title, r.url, m.storage_key, m.filename, r.available_from from event_resources r left join media_assets m on m.id = r.media_id
      where r.event_id = $1 order by r.position, r.created_at`, [eventId],
  )).map(async (r) => ({
    id: r.id, kind: r.kind, title: r.title, availableFrom: r.available_from,
    url: r.available_from && r.available_from > now ? null : r.storage_key ? await storage().signedUrl(r.storage_key, { expiresInSeconds: 1800, downloadName: r.kind === "recording" ? undefined : r.filename ?? undefined }) : r.url,
  })));
  const feedback = await db.one<{ rating: number }>("select rating from event_feedback where registration_id = $1", [reg.id]);
  const certificate = await db.one<{ code: string }>(
    "select ce.code from certificates ce join contacts c on c.id = ce.contact_id where ce.event_id = $1 and c.user_id = $2 and ce.revoked_at is null", [eventId, userId]);
  return {
    event: e, registrationId: reg.id, window, nextSession: next, sessions, resources, feedbackGiven: Boolean(feedback), certificate: certificate?.code ?? null,
    meeting: window === "open" && access ? { provider: access.meeting_provider, url: access.meeting_url, meetingId: access.meeting_id, passcode: access.passcode } : null,
    instructions: window !== "closed" ? access?.instructions ?? "" : "",
    opensMinutesBefore: access?.access_opens_minutes_before ?? 30,
  };
}

export function myCourses(userId: string) {
  return db.query<{ id: string; slug: string; title: string; status: string; progress: number; total: number; cover_key: string | null; last_lesson_id: string | null }>(
    `select co.id, co.slug, co.title, e.status, e.last_lesson_id, m.storage_key as cover_key,
            (select count(*) from lessons l where l.course_id = co.id)::int as total,
            coalesce(round(100.0 * (select count(*) from lesson_progress p where p.enrolment_id = e.id and p.completed_at is not null) / nullif((select count(*) from lessons l where l.course_id = co.id), 0)), 0)::int as progress
       from enrolments e join courses co on co.id = e.course_id join contacts c on c.id = e.contact_id left join media_assets m on m.id = co.cover_media_id
      where c.user_id = $1 and e.status in ('active','completed')
        and exists (select 1 from entitlements x where x.contact_id = e.contact_id and x.resource_type = 'course' and x.resource_id = co.id and x.revoked_at is null)
      order by e.enrolled_at desc`,
    [userId],
  );
}

export function myLibrary(userId: string) {
  return db.query<{ entitlement_id: string; product_id: string; title: string; kind: string; download_limit: number | null; downloads: number; cover_key: string | null }>(
    `select x.id as entitlement_id, p.id as product_id, p.title, p.kind, p.download_limit, m.storage_key as cover_key,
            (select count(*) from downloads d where d.entitlement_id = x.id)::int as downloads
       from entitlements x join products p on p.id = x.resource_id join contacts c on c.id = x.contact_id left join media_assets m on m.id = p.cover_media_id
      where c.user_id = $1 and x.resource_type = 'product' and x.revoked_at is null and (x.expires_at is null or x.expires_at > now())
      order by x.granted_at desc`,
    [userId],
  );
}

/** Issues a short-lived signed download URL after checking ownership and download limits. */
export async function downloadProduct(userId: string, entitlementId: string, ipHash: string): Promise<string> {
  const row = await db.one<{ id: string; download_limit: number | null; downloads: number; storage_key: string; filename: string; media_id: string; title: string }>(
    `select x.id, p.download_limit, m.storage_key, m.filename, m.id as media_id, p.title,
            (select count(*) from downloads d where d.entitlement_id = x.id)::int as downloads
       from entitlements x join contacts c on c.id = x.contact_id join products p on p.id = x.resource_id join media_assets m on m.id = p.file_media_id
      where x.id = $1 and c.user_id = $2 and x.resource_type = 'product' and x.revoked_at is null`,
    [entitlementId, userId],
  );
  if (!row) throw new PortalError("Download not found.");
  if (row.download_limit !== null && row.downloads >= row.download_limit) throw new PortalError("You've reached the download limit for this item. Contact us if you need it again.");
  await db.query("insert into downloads (entitlement_id, media_id, ip_hash) values ($1,$2,$3)", [row.id, row.media_id, ipHash]);
  return storage().signedUrl(row.storage_key, { expiresInSeconds: 300, downloadName: row.filename });
}

export function myOrders(userId: string) {
  return db.query<{ id: string; reference: string; status: string; total_minor: number; refunded_minor: number; currency: string; created_at: Date; items: string; receipt: string | null }>(
    `select o.id, o.reference, o.status, o.total_minor, o.refunded_minor, o.currency, o.created_at, i.number as receipt,
            (select string_agg(description, ', ') from order_items x where x.order_id = o.id) as items
       from orders o join contacts c on c.id = o.contact_id left join invoices i on i.order_id = o.id
      where c.user_id = $1 and o.status <> 'expired' order by o.created_at desc`,
    [userId],
  );
}

export function myCertificates(userId: string) {
  return db.query<{ code: string; title: string; issued_at: Date }>(
    "select ce.code, ce.title, ce.issued_at from certificates ce join contacts c on c.id = ce.contact_id where c.user_id = $1 and ce.revoked_at is null order by ce.issued_at desc",
    [userId],
  );
}
