import "server-only";
import { db } from "@/lib/database/pool";
import type { SessionUser } from "@/lib/auth/session";

export type SearchHit = { kind: string; title: string; detail: string; href: string };

/**
 * Studio-wide search. Each source is only queried when the user holds the
 * permission for it, so results never leak across roles.
 */
export async function globalSearch(user: SessionUser, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const can = (p: Parameters<SessionUser["permissions"]["has"]>[0]) => user.permissions.has(p);
  const jobs: Promise<SearchHit[]>[] = [];
  if (can("crm:view")) {
    jobs.push(db.query<{ id: string; full_name: string; email: string | null; phone: string | null; stage: string | null }>(
      `select c.id, c.full_name, c.email::text as email, c.phone, s.name as stage from contacts c left join pipeline_stages s on s.id = c.stage_id
        where c.full_name ilike $1 or c.email::text ilike $1 or c.phone ilike $1 or c.company ilike $1 order by c.updated_at desc limit 8`, [like],
    ).then((r) => r.map((c) => ({ kind: "Contact", title: c.full_name || c.email || "Contact", detail: [c.email, c.phone, c.stage].filter(Boolean).join(" · "), href: `/admin/crm/${c.id}` }))));
  }
  if (can("payments:view")) {
    jobs.push(db.query<{ id: string; reference: string; customer: string; status: string }>(
      `select o.id, o.reference, coalesce(nullif(o.customer_name,''), o.email::text) as customer, o.status from orders o
        where o.reference ilike $1 or o.email::text ilike $1 or o.customer_name ilike $1
           or exists (select 1 from payments p where p.order_id = o.id and p.provider_reference ilike $1)
           or exists (select 1 from invoices i where i.order_id = o.id and i.number ilike $1)
        order by o.created_at desc limit 6`, [like],
    ).then((r) => r.map((o) => ({ kind: "Order", title: o.reference, detail: `${o.customer} · ${o.status.replace("_", " ")}`, href: `/admin/payments/${o.id}` }))));
  }
  if (can("bookings:view")) {
    jobs.push(db.query<{ id: string; reference: string; service: string; who: string; starts_at: Date }>(
      `select a.id, a.reference, s.name as service, coalesce(nullif(c.full_name,''), c.email::text) as who, a.starts_at from appointments a
         join services s on s.id = a.service_id join contacts c on c.id = a.contact_id
        where a.reference ilike $1 or c.full_name ilike $1 or c.email::text ilike $1 order by a.starts_at desc limit 6`, [like],
    ).then((r) => r.map((a) => ({ kind: "Appointment", title: `${a.service} — ${a.who}`, detail: `${a.reference} · ${a.starts_at.toISOString().slice(0, 10)}`, href: `/admin/bookings/${a.id}` }))));
  }
  if (can("events:view")) {
    jobs.push(db.query<{ id: string; title: string; status: string; starts_at: Date }>(
      `select id, title, status, starts_at from events where title ilike $1 or slug ilike $1 order by starts_at desc limit 5`, [like],
    ).then((r) => r.map((e) => ({ kind: "Masterclass", title: e.title, detail: `${e.status} · ${e.starts_at.toISOString().slice(0, 10)}`, href: `/admin/events/${e.id}` }))));
    jobs.push(db.query<{ event_id: string; attendee_name: string; attendee_email: string; title: string; status: string }>(
      `select r.event_id, r.attendee_name, r.attendee_email::text as attendee_email, e.title, r.status from event_registrations r join events e on e.id = r.event_id
        where r.attendee_email::text ilike $1 or r.attendee_name ilike $1 or r.reference ilike $1 order by r.created_at desc limit 5`, [like],
    ).then((r) => r.map((x) => ({ kind: "Registration", title: `${x.attendee_name || x.attendee_email} — ${x.title}`, detail: x.status, href: `/admin/events/${x.event_id}?tab=attendees` }))));
  }
  if (can("courses:manage")) {
    jobs.push(db.query<{ id: string; title: string; status: string }>("select id, title, status from courses where title ilike $1 limit 4", [like])
      .then((r) => r.map((c) => ({ kind: "Course", title: c.title, detail: c.status, href: `/admin/academy/${c.id}` }))));
  }
  if (can("products:manage")) {
    jobs.push(db.query<{ id: string; title: string; status: string }>("select id, title, status from products where title ilike $1 limit 4", [like])
      .then((r) => r.map((p) => ({ kind: "Product", title: p.title, detail: p.status, href: `/admin/shop/${p.id}` }))));
  }
  if (can("content:edit")) {
    jobs.push(db.query<{ id: string; title: string; status: string }>("select id, title, status from articles where title ilike $1 order by updated_at desc limit 4", [like])
      .then((r) => r.map((a) => ({ kind: "Article", title: a.title, detail: a.status, href: `/admin/content/${a.id}` }))));
  }
  return (await Promise.all(jobs)).flat();
}
