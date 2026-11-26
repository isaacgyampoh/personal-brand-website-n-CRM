import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { getIntegration } from "@/lib/integrations/store";
import { paymentsReady } from "@/features/payments/application/gateway";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty, Pager, Notice } from "@/components/dashboard/ui";

export const metadata = { title: "Payments" };
const STATUSES = ["paid", "pending", "failed", "expired", "refunded", "partially_refunded", "needs_attention", "cancelled"];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const user = await requireStaffPage("payments:view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const biz = await loadSetting("business");
  const params: unknown[] = [];
  const where: string[] = [];
  if (sp.status && STATUSES.includes(sp.status)) { params.push(sp.status); where.push(`o.status = $${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(o.reference ilike $${params.length} or o.email::text ilike $${params.length} or o.customer_name ilike $${params.length})`); }
  const rows = await db.query<{ id: string; reference: string; status: string; total_minor: number; currency: string; created_at: Date; customer: string; items: string; channel: string | null }>(
    `select o.id, o.reference, o.status, o.total_minor, o.currency, o.created_at, coalesce(nullif(o.customer_name,''), o.email::text) as customer,
            (select string_agg(description, ', ') from order_items i where i.order_id = o.id) as items,
            (select coalesce(channel, provider) from payments p where p.order_id = o.id and p.status = 'success' limit 1) as channel
       from orders o ${where.length ? `where ${where.join(" and ")}` : ""} order by o.created_at desc limit 51 offset ${(page - 1) * 50}`,
    params,
  );
  const pay = await getIntegration("paystack");
  const ready = await paymentsReady();
  return (
    <div>
      <PageTitle title="Payments & orders" actions={<>
        <LinkButton href="/admin/payments/reconciliation" variant="outline">Reconciliation</LinkButton>
        {user.permissions.has("finance:export") && <LinkButton href="/api/admin/export/ledger" variant="outline">Export ledger</LinkButton>}
        {user.permissions.has("finance:export") && <LinkButton href="/api/admin/export/orders" variant="outline">Export orders</LinkButton>}
      </>} />
      {!ready && <div className="mb-4"><Notice>Online checkout is off until a payment provider is connected and verified in Settings → Integrations. Free registrations and manual payments still work.</Notice></div>}
      {ready && pay.mode === "test" && <div className="mb-4"><Notice tone="blue">Paystack TEST mode. No real money moves.</Notice></div>}
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Reference, email or name" className="h-9 rounded-lg border bg-background px-3 text-sm" aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Status"><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <button className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background">Filter</button>
      </form>
      {rows.length === 0 ? <Empty title="No orders" body="Orders appear when someone books, registers or buys." /> : (
        <>
          <Table head={["Order", "Customer", "Items", "Total", "Status", "Date"]}>
            {rows.slice(0, 50).map((o) => (
              <tr key={o.id} className="hover:bg-muted/40">
                <Td><Link href={`/admin/payments/${o.id}`} className="font-mono text-xs font-medium hover:underline">{o.reference}</Link></Td>
                <Td>{o.customer}</Td>
                <Td className="max-w-64 truncate text-xs text-muted-foreground">{o.items}</Td>
                <Td className="tabular-nums">{o.total_minor ? formatMoney(o.total_minor, o.currency) : "Free"}{o.channel && <div className="text-xs capitalize text-muted-foreground">{o.channel.replace("_", " ")}</div>}</Td>
                <Td><StatusBadge status={o.status} /></Td>
                <Td className="text-xs">{formatInZone(o.created_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} hasMore={rows.length > 50} base={`/admin/payments?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}) })}`} />
        </>
      )}
    </div>
  );
}
