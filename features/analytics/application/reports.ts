import "server-only";
import { db } from "@/lib/database/pool";
import type { DateRange } from "./range";

export async function analyticsReport(r: DateRange, tz: string) {
  const p = [r.from, r.to];
  const [daily, pages, sources, devices, funnel, revenueByType, retention, email, campaigns] = await Promise.all([
    db.query<{ day: string; visitors: number; views: number }>(
      `select to_char((occurred_at at time zone $3)::date, 'YYYY-MM-DD') as day, count(distinct visitor_hash)::int as visitors, count(*)::int as views
         from analytics_events where name = 'page_view' and occurred_at >= $1 and occurred_at < $2 group by 1 order by 1`, [...p, tz]),
    db.query<{ path: string; views: number; visitors: number }>(
      `select path, count(*)::int as views, count(distinct visitor_hash)::int as visitors from analytics_events
        where name = 'page_view' and occurred_at >= $1 and occurred_at < $2 group by path order by views desc limit 15`, p),
    db.query<{ source: string; visitors: number }>(
      `select coalesce(utm_source, referrer_host, '(direct)') as source, count(distinct visitor_hash)::int as visitors from analytics_events
        where name = 'page_view' and occurred_at >= $1 and occurred_at < $2 group by 1 order by 2 desc limit 12`, p),
    db.query<{ device: string; visitors: number }>(
      `select coalesce(device, 'unknown') as device, count(distinct visitor_hash)::int as visitors from analytics_events
        where name = 'page_view' and occurred_at >= $1 and occurred_at < $2 group by 1 order by 2 desc`, p),
    db.one<{ visitors: number; leads: number; bookings: number; registrations: number; paid_orders: number }>(
      `select (select count(distinct visitor_hash) from analytics_events where name = 'page_view' and occurred_at >= $1 and occurred_at < $2)::int as visitors,
              (select count(*) from contacts where created_at >= $1 and created_at < $2)::int as leads,
              (select count(*) from appointments where created_at >= $1 and created_at < $2 and status in ('confirmed','completed'))::int as bookings,
              (select count(*) from event_registrations where created_at >= $1 and created_at < $2 and status = 'confirmed')::int as registrations,
              (select count(*) from orders where paid_at >= $1 and paid_at < $2 and total_minor > 0)::int as paid_orders`, p),
    db.query<{ item_type: string; revenue: number; orders: number }>(
      `select i.item_type, sum(i.total_minor)::bigint as revenue, count(distinct o.id)::int as orders from order_items i join orders o on o.id = i.order_id
        where o.paid_at >= $1 and o.paid_at < $2 and o.status in ('paid','partially_refunded') group by 1 order by 2 desc`, p),
    db.one<{ customers: number; returning: number }>(
      `select count(*)::int as customers, count(*) filter (where n > 1)::int as returning from
        (select contact_id, count(*) as n from orders where status in ('paid','partially_refunded') and total_minor > 0 group by contact_id) x`),
    db.one<{ accepted: number; failed: number; suppressed: number }>(
      `select count(*) filter (where status in ('accepted','delivered'))::int as accepted, count(*) filter (where status = 'failed')::int as failed,
              count(*) filter (where status = 'suppressed')::int as suppressed from notifications where created_at >= $1 and created_at < $2 and channel = 'email'`, p),
    db.query<{ campaign: string; clicks: number }>(
      `select coalesce(utm_campaign, '(none)') as campaign, count(*)::int as clicks from analytics_events
        where occurred_at >= $1 and occurred_at < $2 and utm_campaign is not null group by 1 order by 2 desc limit 10`, p),
  ]);
  return { daily, pages, sources, devices, funnel: funnel!, revenueByType, retention: retention!, email: email!, campaigns };
}
