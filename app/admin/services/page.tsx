import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { formatMoney } from "@/lib/money";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty } from "@/components/dashboard/ui";
import type { ServiceRow } from "@/features/bookings/infrastructure/repository";

export const metadata = { title: "Services" };

export default async function ServicesAdmin() {
  await requireStaffPage("bookings:manage");
  const rows = await db.query<ServiceRow & { upcoming: number }>(
    `select s.*, (select count(*) from appointments a where a.service_id = s.id and a.status = 'confirmed' and a.starts_at > now())::int as upcoming
       from services s order by s.is_active desc, s.sort_order, s.name`,
  );
  return (
    <div>
      <PageTitle title="Services" description="Coaching, consulting and mentorship offers shown on the website and booking flow."
        actions={<><LinkButton href="/admin/bookings/availability" variant="outline">Working hours</LinkButton><LinkButton href="/admin/services/new">New service</LinkButton></>} />
      {rows.length === 0 ? <Empty title="No services yet" action={<LinkButton href="/admin/services/new">Create your first service</LinkButton>} /> : (
        <Table head={["Service", "Price", "Duration", "Booking", "Upcoming", "Status"]}>
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-muted/40">
              <Td><Link href={`/admin/services/${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-muted-foreground">/{s.slug}{s.featured ? " · featured" : ""}{s.is_demo ? " · demo" : ""}</div></Td>
              <Td>{s.price_minor ? formatMoney(s.price_minor, s.currency) : "Free"}</Td>
              <Td>{s.duration_minutes} min{s.capacity > 1 ? ` · up to ${s.capacity}` : ""}</Td>
              <Td className="capitalize">{s.booking_mode}</Td>
              <Td>{s.upcoming}</Td>
              <Td><StatusBadge status={s.is_active ? "active" : "archived"} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
