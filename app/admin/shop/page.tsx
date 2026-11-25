import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { formatMoney } from "@/lib/money";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty } from "@/components/dashboard/ui";

export const metadata = { title: "Shop" };

export default async function ShopAdmin() {
  await requireStaffPage("products:manage");
  const rows = await db.query<{ id: string; title: string; slug: string; kind: string; status: string; price_minor: number; currency: string; is_lead_magnet: boolean; owners: number; downloads: number; is_demo: boolean }>(
    `select p.*, (select count(*) from entitlements e where e.resource_type = 'product' and e.resource_id = p.id and e.revoked_at is null)::int as owners,
       (select count(*) from downloads d join entitlements e on e.id = d.entitlement_id where e.resource_id = p.id)::int as downloads
     from products p order by p.created_at desc`);
  return (
    <div>
      <PageTitle title="Digital shop" description="E-books, templates, guides and recordings. Files are private and delivered via expiring links." actions={<LinkButton href="/admin/shop/new">New product</LinkButton>} />
      {rows.length === 0 ? <Empty title="No products yet" action={<LinkButton href="/admin/shop/new">Add a product</LinkButton>} /> : (
        <Table head={["Product", "Price", "Customers", "Downloads", "Status"]}>
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-muted/40">
              <Td><Link href={`/admin/shop/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="text-xs capitalize text-muted-foreground">{p.kind}{p.is_lead_magnet ? " · lead magnet" : ""}{p.is_demo ? " · demo" : ""}</div></Td>
              <Td>{p.price_minor ? formatMoney(p.price_minor, p.currency) : "Free"}</Td>
              <Td>{p.owners}</Td><Td>{p.downloads}</Td>
              <Td><StatusBadge status={p.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
