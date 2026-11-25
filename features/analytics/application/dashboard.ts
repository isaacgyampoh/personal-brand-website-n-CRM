import "server-only";
import { db } from "@/lib/database/pool";
import type { DateRange } from "./range";

const sumLedger = (from: Date, to: Date) =>
  db.one<{ net: number; gross: number; refunds: number }>(
    `select coalesce(sum(amount_minor),0)::bigint as net,
            coalesce(sum(amount_minor) filter (where amount_minor > 0),0)::bigint as gross,
            coalesce(-sum(amount_minor) filter (where amount_minor < 0),0)::bigint as refunds
       from financial_ledger where created_at >= $1 and created_at < $2`,
    [from, to],
  );

/** All dashboard figures come from real records; nothing is estimated or invented. */
export async function dashboardData(r: DateRange, tz: string) {
  const [rev, prevRev, mtd, counts, prevCounts, visitors, prevVisitors, series, upcomingAppts, upcomingEvents, recentTx, activity, attention] = await Promise.all([
    sumLedger(r.from, r.to),
    sumLedger(r.prevFrom, r.prevTo),
    db.one<{ net: number }>(
      `select coalesce(sum(amount_minor),0)::bigint as net from financial_ledger
        where created_at >= date_trunc('month', now() at time zone $1) at time zone $1`,
      [tz],
    ),
    db.one<{ customers: number; leads: number; paid_regs: number; active_students: number; pending_orders: number; paid_orders: number; bookings: number }>(
      `select (select count(*) from contacts where lifecycle = 'customer' and deleted_at is null)::int as customers,
              (select count(*) from contacts where created_at >= $1 and created_at < $2 and deleted_at is null)::int as leads,
              (select count(*) from event_registrations r join orders o on o.id = r.order_id where r.status = 'confirmed' and o.paid_at >= $1 and o.paid_at < $2)::int as paid_regs,
              (select count(*) from enrolments where status = 'active')::int as active_students,
              (select count(*) from orders where status = 'pending' and (expires_at is null or expires_at > now()))::int as pending_orders,
              (select count(*) from orders where paid_at >= $1 and paid_at < $2 and total_minor > 0)::int as paid_orders,
              (select count(*) from appointments where created_at >= $1 and created_at < $2 and status in ('confirmed','completed'))::int as bookings`,
      [r.from, r.to],
    ),
    db.one<{ leads: number; paid_orders: number }>(
      `select (select count(*) from contacts where created_at >= $1 and created_at < $2)::int as leads,
              (select count(*) from orders where paid_at >= $1 and paid_at < $2 and total_minor > 0)::int as paid_orders`,
      [r.prevFrom, r.prevTo],
    ),
    db.one<{ visitors: number; views: number }>(
      `select count(distinct (visitor_hash, (occurred_at at time zone 'UTC')::date))::int as visitors, count(*)::int as views
         from analytics_events where name = 'page_view' and occurred_at >= $1 and occurred_at < $2`,
      [r.from, r.to],
    ),
    db.one<{ visitors: number }>(
      `select count(distinct (visitor_hash, (occurred_at at time zone 'UTC')::date))::int as visitors
         from analytics_events where name = 'page_view' and occurred_at >= $1 and occurred_at < $2`,
      [r.prevFrom, r.prevTo],
    ),
    db.query<{ day: string; revenue: number; visitors: number }>(
      `with days as (select generate_series(($1::timestamptz at time zone $3)::date, (($2::timestamptz - interval '1 second') at time zone $3)::date, interval '1 day')::date as day)
       select to_char(d.day, 'YYYY-MM-DD') as day,
              coalesce((select sum(amount_minor) from financial_ledger l where (l.created_at at time zone $3)::date = d.day),0)::bigint as revenue,
              coalesce((select count(distinct visitor_hash) from analytics_events a where a.name = 'page_view' and (a.occurred_at at time zone $3)::date = d.day),0)::int as visitors
         from days d order by d.day`,
      [r.from, r.to, tz],
    ),
    db.query<{ id: string; reference: string; starts_at: Date; service: string; name: string; status: string }>(
      `select a.id, a.reference, a.starts_at, s.name as service, coalesce(nullif(c.full_name,''), c.email::text) as name, a.status
         from appointments a join services s on s.id = a.service_id join contacts c on c.id = a.contact_id
        where a.status = 'confirmed' and a.starts_at >= now() order by a.starts_at limit 6`,
    ),
    db.query<{ id: string; title: string; starts_at: Date; capacity: number | null; sold: number; revenue: number }>(
      `select e.id, e.title, e.starts_at, e.capacity,
              (select count(*) from event_registrations r where r.event_id = e.id and r.status = 'confirmed')::int as sold,
              coalesce((select sum(i.total_minor) from order_items i join orders o on o.id = i.order_id
                 where i.item_type = 'event_ticket' and (i.metadata->>'eventId')::uuid = e.id and o.status in ('paid','partially_refunded')),0)::bigint as revenue
         from events e where e.status = 'published' and e.ends_at > now() order by e.starts_at limit 5`,
    ),
    db.query<{ id: number; kind: string; amount_minor: number; currency: string; created_at: Date; reference: string; customer: string }>(
      `select l.id, l.kind, l.amount_minor, l.currency, l.created_at, o.reference, coalesce(nullif(o.customer_name,''), o.email::text) as customer
         from financial_ledger l join orders o on o.id = l.order_id order by l.created_at desc limit 8`,
    ),
    db.query<{ id: string; kind: string; title: string; occurred_at: Date; contact_id: string; name: string }>(
      `select a.id, a.kind, a.title, a.occurred_at, a.contact_id, coalesce(nullif(c.full_name,''), c.email::text, c.phone) as name
         from crm_activities a join contacts c on c.id = a.contact_id order by a.occurred_at desc limit 10`,
    ),
    db.one<{ tasks_due: number; needs_attention: number; dead_jobs: number; pending_testimonials: number; follow_ups: number; new_enquiries: number; failed_emails: number }>(
      `select (select count(*) from tasks where status = 'open' and (due_at is null or due_at < now() + interval '1 day'))::int as tasks_due,
              (select count(*) from orders where status = 'needs_attention')::int as needs_attention,
              (select count(*) from jobs where status = 'dead')::int as dead_jobs,
              (select count(*) from testimonials where status = 'pending')::int as pending_testimonials,
              (select count(*) from contacts where next_follow_up_at < now() and deleted_at is null)::int as follow_ups,
              (select count(*) from form_submissions where status = 'new')::int as new_enquiries,
              (select count(*) from notifications where status = 'failed' and created_at > now() - interval '7 days')::int as failed_emails`,
    ),
  ]);
  return { rev: rev!, prevRev: prevRev!, mtd: mtd!.net, counts: counts!, prevCounts: prevCounts!, visitors: visitors!, prevVisitors: prevVisitors!.visitors, series, upcomingAppts, upcomingEvents, recentTx, activity, attention: attention! };
}
