import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty } from "@/components/dashboard/ui";

export const metadata = { title: "Masterclasses" };

export default async function EventsAdmin({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireStaffPage("events:view");
  const past = (await searchParams).show === "past";
  const biz = await loadSetting("business");
  const rows = await db.query<{ id: string; title: string; slug: string; status: string; starts_at: Date; format: string; kind: string; capacity: number | null; sold: number; revenue: number; waitlist: number; is_demo: boolean }>(
    `select e.id, e.title, e.slug, e.status, e.starts_at, e.format, e.kind, e.capacity, e.is_demo,
       (select count(*) from event_registrations r where r.event_id = e.id and r.status = 'confirmed')::int as sold,
       (select count(*) from event_waitlist w where w.event_id = e.id and w.status = 'waiting')::int as waitlist,
       coalesce((select sum(i.total_minor) from order_items i join orders o on o.id = i.order_id where i.item_type = 'event_ticket' and (i.metadata->>'eventId')::uuid = e.id and o.status in ('paid','partially_refunded')),0)::bigint as revenue
     from events e where ${past ? "e.ends_at < now()" : "e.ends_at >= now() or e.status = 'draft'"} order by e.starts_at ${past ? "desc" : "asc"} limit 200`,
  );
  return (
    <div>
      <PageTitle title="Masterclasses & events" actions={<>
        <div className="flex items-center gap-3 text-sm"><Link href="/admin/events" className={!past ? "font-semibold" : "text-muted-foreground"}>Upcoming</Link><Link href="/admin/events?show=past" className={past ? "font-semibold" : "text-muted-foreground"}>Past</Link></div>
        {user.permissions.has("events:manage") && <><LinkButton href="/admin/events/new" variant="outline">Advanced form</LinkButton><LinkButton href="/admin/events/quick">Quick masterclass</LinkButton></>}
      </>} />
      {rows.length === 0 ? <Empty title={past ? "No past events" : "No upcoming events"} action={<LinkButton href="/admin/events/quick">Create a masterclass</LinkButton>} /> : (
        <Table head={["Event", "Date", "Seats", "Revenue", "Status"]}>
          {rows.map((e) => (
            <tr key={e.id} className="hover:bg-muted/40">
              <Td><Link href={`/admin/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link><div className="text-xs capitalize text-muted-foreground">{e.kind.replace("_", " ")} · {e.format.replace("_", " ")}{e.is_demo ? " · demo" : ""}</div></Td>
              <Td>{formatInZone(e.starts_at, biz.timezone, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
              <Td>{e.sold}{e.capacity ? ` / ${e.capacity}` : ""}{e.waitlist ? <span className="block text-xs text-muted-foreground">{e.waitlist} waiting</span> : null}</Td>
              <Td className="tabular-nums">{formatMoney(e.revenue, biz.currency)}</Td>
              <Td><StatusBadge status={e.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
