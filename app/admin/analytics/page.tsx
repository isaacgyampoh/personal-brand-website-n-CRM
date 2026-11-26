import { requireStaffPage } from "@/lib/auth/session";
import { loadSetting } from "@/features/settings/application/settings";
import { resolveRange } from "@/features/analytics/application/range";
import { analyticsReport } from "@/features/analytics/application/reports";
import { formatMoney } from "@/lib/money";
import { PageTitle, Panel, Stat, LinkButton } from "@/components/dashboard/ui";
import { BarsChart } from "@/components/dashboard/charts";
import { RangeFilter } from "@/components/dashboard/range-filter";

export const metadata = { title: "Analytics" };
const LABELS: Record<string, string> = { appointment: "Appointments", event_ticket: "Masterclass tickets", course: "Courses", product: "Digital products" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireStaffPage("analytics:view");
  const sp = await searchParams;
  const biz = await loadSetting("business");
  const range = resolveRange(sp, biz.timezone);
  const a = await analyticsReport(range, biz.timezone);
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
  const qs = new URLSearchParams({ range: range.key, ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) }).toString();
  return (
    <div className="space-y-6">
      <PageTitle title="Analytics" description={`${range.label}. First-party, cookieless, privacy-respecting (Do Not Track and Global Privacy Control are honoured).`}
        actions={<><RangeFilter base="/admin/analytics" current={range.key} from={sp.from} to={sp.to} /><LinkButton href={`/api/admin/export/analytics?${qs}`} variant="outline">Export CSV</LinkButton></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Visitors" value={a.funnel.visitors} /><Stat label="New leads" value={a.funnel.leads} hint={pct(a.funnel.leads, a.funnel.visitors) + " of visitors"} />
        <Stat label="Bookings" value={a.funnel.bookings} /><Stat label="Registrations" value={a.funnel.registrations} /><Stat label="Paid orders" value={a.funnel.paid_orders} hint={pct(a.funnel.paid_orders, a.funnel.visitors) + " conversion"} />
      </div>
      <Panel title="Visitors per day"><BarsChart data={a.daily} xKey="day" yKey="visitors" label="Unique visitors per day" /></Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top pages"><ul className="divide-y text-sm">{a.pages.map((p) => <li key={p.path} className="flex justify-between py-2"><span className="truncate font-mono text-xs">{p.path}</span><span className="tabular-nums">{p.views} views · {p.visitors} visitors</span></li>)}{!a.pages.length && <li className="text-muted-foreground">No data yet.</li>}</ul></Panel>
        <Panel title="Traffic sources"><ul className="divide-y text-sm">{a.sources.map((s) => <li key={s.source} className="flex justify-between py-2"><span>{s.source}</span><span className="tabular-nums">{s.visitors}</span></li>)}{!a.sources.length && <li className="text-muted-foreground">No data yet.</li>}</ul></Panel>
        <Panel title="Revenue by offer">{a.revenueByType.length ? <ul className="divide-y text-sm">{a.revenueByType.map((r) => <li key={r.item_type} className="flex justify-between py-2"><span>{LABELS[r.item_type] ?? r.item_type}</span><span className="tabular-nums">{formatMoney(r.revenue, biz.currency)} · {r.orders} orders</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No paid orders in this period.</p>}</Panel>
        <Panel title="Devices & retention">
          <ul className="divide-y text-sm">{a.devices.map((d) => <li key={d.device} className="flex justify-between py-2 capitalize"><span>{d.device}</span><span>{d.visitors}</span></li>)}</ul>
          <p className="mt-4 text-sm">Returning customers: <strong>{a.retention.returning}</strong> of {a.retention.customers} paying customers ({pct(a.retention.returning, a.retention.customers)})</p>
        </Panel>
        <Panel title="Email delivery" description="“Accepted” means the mail server accepted the message; inbox delivery is not guaranteed.">
          <p className="text-sm">Accepted: <strong>{a.email.accepted}</strong> · Failed: <strong>{a.email.failed}</strong> · Suppressed: <strong>{a.email.suppressed}</strong></p>
        </Panel>
        <Panel title="Campaign landings (UTM)"><ul className="divide-y text-sm">{a.campaigns.map((c) => <li key={c.campaign} className="flex justify-between py-2"><span>{c.campaign}</span><span>{c.clicks}</span></li>)}{!a.campaigns.length && <li className="text-muted-foreground">Use tracked links in Marketing to attribute campaigns.</li>}</ul></Panel>
      </div>
    </div>
  );
}
