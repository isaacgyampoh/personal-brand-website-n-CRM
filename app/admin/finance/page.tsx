import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { loadSetting } from "@/features/settings/application/settings";
import { financeSummary, transactions, ITEM_TYPES, ORDER_STATUSES, PROVIDERS } from "@/features/finance/application/finance";
import { CURRENCIES } from "@/lib/integrations/definitions";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { PageTitle, Panel, Stat, Table, Td, StatusBadge, LinkButton, Empty, Notice } from "@/components/dashboard/ui";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { BarsChart } from "@/components/dashboard/charts";
import { financeFilter, financeQuery, type FinanceSearch } from "./filters";

export const metadata = { title: "Finance" };
export const dynamic = "force-dynamic";
const PAGE = 50;
const TYPE_LABEL = Object.fromEntries(ITEM_TYPES) as Record<string, string>;

/** Money received, refunds, outstanding balances and every transaction — from live records only. */
export default async function FinancePage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const user = await requireStaffPage("payments:view", "/admin/finance");
  const sp = await searchParams;
  const biz = await loadSetting("business");
  const { filter, label, key } = financeFilter(sp, biz.timezone, biz.currency);
  const page = Math.max(1, Number(sp.page) || 1);
  const [s, rows] = await Promise.all([financeSummary(filter), transactions(filter, { limit: PAGE + 1, offset: (page - 1) * PAGE })]);
  const money = (m: number) => formatMoney(m, filter.currency);
  const canExport = user.permissions.has("finance:export");
  const q = (extra: Record<string, string> = {}) => financeQuery(sp, extra);
  return (
    <div className="space-y-6">
      <PageTitle title="Finance" description={`${label} · ${filter.currency} · money actually received and refunded (ledger)`}
        actions={<RangeFilter base="/admin/finance" current={key} from={sp.from} to={sp.to} />} />
      {s.attention.count > 0 && <Notice tone="red">{s.attention.count} order(s) need attention ({money(s.attention.total)}). <Link className="underline" href={`/admin/finance?${q({ status: "needs_attention" })}`}>Review</Link></Notice>}
      {s.refundsOpen.count > 0 && <Notice tone="amber">{s.refundsOpen.count} refund(s) in progress ({money(s.refundsOpen.total)}).</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received" value={money(s.received)} hint={`${s.payments} payment(s)${s.manual ? ` · ${money(s.manual)} recorded manually` : ""}`} />
        <Stat label="Refunded" value={money(s.refunded)} />
        <Stat label="Net revenue" value={money(s.net)} />
        <Stat label="Awaiting payment" value={money(s.pending.total)} hint={`${s.pending.count} pending order(s) · ${s.failedPayments} failed attempt(s)`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Daily net received" className="lg:col-span-2">
          {s.daily.length ? <BarsChart data={s.daily.map((d) => ({ day: d.day, net: (d.received - d.refunded) / 100 }))} xKey="day" yKey="net" label={`Net received (${filter.currency})`} /> : <p className="text-sm text-muted-foreground">No payments in this period.</p>}
        </Panel>
        <Panel title="By provider">
          {s.byProvider.length ? <ul className="divide-y text-sm">{s.byProvider.map((p) => <li key={p.provider} className="flex justify-between py-2"><span className="capitalize">{p.provider}</span><span className="text-right tabular-nums">{money(p.received - p.refunded)}{p.refunded > 0 && <span className="block text-xs text-muted-foreground">{money(p.refunded)} refunded</span>}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No payments yet.</p>}
          <h3 className="mt-4 text-xs font-semibold uppercase text-muted-foreground">By type (gross)</h3>
          <ul className="divide-y text-sm">{s.byType.map((t) => <li key={t.item_type} className="flex justify-between py-2"><span>{TYPE_LABEL[t.item_type] ?? t.item_type}</span><span className="tabular-nums">{money(t.gross)}</span></li>)}</ul>
        </Panel>
      </div>

      <Panel title="Revenue by service, masterclass, course and product" description="Refunds are allocated to items in proportion to the order.">
        {s.byItem.length ? (
          <Table head={["Item", "Type", "Sold", "Gross", "Refunded", "Net"]}>
            {s.byItem.map((r) => <tr key={`${r.item_type}:${r.description}`}><Td className="font-medium">{r.description}</Td><Td className="text-xs">{TYPE_LABEL[r.item_type]}</Td><Td>{r.qty}</Td><Td className="tabular-nums">{money(r.gross)}</Td><Td className="tabular-nums">{money(r.refunded)}</Td><Td className="tabular-nums font-medium">{money(r.net)}</Td></tr>)}
          </Table>
        ) : <p className="text-sm text-muted-foreground">No paid orders in this period.</p>}
      </Panel>

      <Panel title="Transactions" actions={canExport && <div className="flex gap-2"><LinkButton href={`/api/admin/export/finance?${q({ format: "csv" })}`} variant="outline" size="sm">CSV</LinkButton><LinkButton href={`/api/admin/export/finance?${q({ format: "xlsx" })}`} variant="outline" size="sm">Excel</LinkButton></div>}>
        <form className="mb-4 flex flex-wrap gap-2" action="/admin/finance">
          {(["range", "from", "to"] as const).map((k) => sp[k] && <input key={k} type="hidden" name={k} value={sp[k]} />)}
          <input name="q" defaultValue={sp.q} placeholder="Order, email, name or payment ref" aria-label="Search transactions" className="h-9 min-w-56 flex-1 rounded-lg border bg-background px-3 text-sm" />
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="h-9 rounded-lg border bg-background px-2 text-sm"><option value="">Any status</option>{ORDER_STATUSES.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select>
          <select name="provider" defaultValue={sp.provider ?? ""} aria-label="Provider" className="h-9 rounded-lg border bg-background px-2 text-sm"><option value="">Any provider</option>{PROVIDERS.map((x) => <option key={x} value={x} className="capitalize">{x}</option>)}</select>
          <select name="type" defaultValue={sp.type ?? ""} aria-label="Type" className="h-9 rounded-lg border bg-background px-2 text-sm"><option value="">Any type</option>{ITEM_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select name="currency" defaultValue={filter.currency} aria-label="Currency" className="h-9 rounded-lg border bg-background px-2 text-sm">{CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}</select>
          <button className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background">Filter</button>
        </form>
        {rows.length === 0 ? <Empty title="No transactions match" body="Try a wider date range or clear the filters." /> : (
          <>
            <Table head={["Order", "Customer", "Items", "Provider", "Total", "Status", "Date"]}>
              {rows.slice(0, PAGE).map((r) => (
                <tr key={r.id}>
                  <Td><Link href={`/admin/payments/${r.id}`} className="font-mono text-xs font-medium hover:underline">{r.reference}</Link>{r.receipt && <div className="text-xs text-muted-foreground">{r.receipt}</div>}</Td>
                  <Td className="text-sm">{r.customer}</Td>
                  <Td className="max-w-64 truncate text-xs">{r.items}</Td>
                  <Td className="text-xs capitalize">{r.providers ?? "—"}</Td>
                  <Td className="tabular-nums">{money(r.total_minor)}{r.refunded_minor > 0 && <div className="text-xs text-violet-700">−{money(r.refunded_minor)}</div>}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="whitespace-nowrap text-xs">{formatInZone(r.created_at, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
                </tr>
              ))}
            </Table>
            <div className="mt-3 flex justify-between text-sm">
              {page > 1 ? <Link className="underline" href={`/admin/finance?${q({ page: String(page - 1) })}`}>← Newer</Link> : <span />}
              {rows.length > PAGE && <Link className="underline" href={`/admin/finance?${q({ page: String(page + 1) })}`}>Older →</Link>}
            </div>
          </>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground">Reconciliation against the payment providers: <Link className="underline" href="/admin/payments/reconciliation">open the reconciliation report</Link>. Manual payments are recorded on each order and appear in the audit log.</p>
    </div>
  );
}
