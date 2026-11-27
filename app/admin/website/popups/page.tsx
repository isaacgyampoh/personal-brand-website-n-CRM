import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { resolveRange } from "@/features/analytics/application/range";
import { popupStats, rate, type PopupRow } from "@/features/popups/application/popups";
import { POPUP_KINDS } from "@/features/popups/domain/popups";
import { popupStatusAction } from "@/features/popups/presentation/actions";
import { formatInZone } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { PageTitle, Panel, Stat, StatusBadge, LinkButton, Table, Td, Empty } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";
import { RangeFilter } from "@/components/dashboard/range-filter";

export const metadata = { title: "Pop-ups & campaigns" };
export const dynamic = "force-dynamic";

const KIND = Object.fromEntries(POPUP_KINDS) as Record<string, string>;
const TEMPLATES: [string, string, string][] = [
  ["event", "Masterclass registration", "Flyer, date, price, seats and a countdown — straight from the event."],
  ["coaching", "Coaching promotion", "Invite visitors to book a discovery call."],
  ["newsletter", "Newsletter", "Collect subscribers with double opt-in."],
  ["resource", "Free resource", "Offer a guide or checklist download."],
  ["offer", "Special offer", "A time-limited promotion with start and end dates."],
  ["custom", "Custom announcement", "Anything else you want visitors to see."],
];

export default async function PopupsAdmin({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireStaffPage("website:edit", "/admin/website/popups");
  const sp = await searchParams;
  const biz = await loadSetting("business");
  const range = resolveRange(sp, biz.timezone);
  const rows = await db.query<PopupRow & { event_title: string | null; event_status: string | null }>(
    `select p.*, e.title as event_title, e.status as event_status from site_popups p left join events e on e.id = p.event_id
      order by (p.status = 'active') desc, p.priority desc, p.updated_at desc`,
  );
  const stats = await popupStats(range.from, range.to);
  const total = [...stats.values()].reduce((a, s) => ({ imp: a.imp + s.impressions, clk: a.clk + s.clicks, conv: a.conv + s.conversions, rev: a.rev + s.revenueMinor }), { imp: 0, clk: 0, conv: 0, rev: 0 });
  const money = (m: number) => formatMoney(m, biz.currency);
  const when = (d: Date | null) => (d ? formatInZone(d, biz.timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

  return (
    <div className="space-y-6">
      <PageTitle title="Pop-ups & campaigns" back={{ href: "/admin/website", label: "Website" }}
        description="Promote masterclasses, coaching, offers and your newsletter. Only one pop-up shows at a time — the highest priority one that fits the page. Never shown in Studio, the client portal, checkout or payment pages."
        actions={<RangeFilter base="/admin/website/popups" current={range.key} from={sp.from} to={sp.to} />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Impressions" value={total.imp} hint={range.label} />
        <Stat label="Button clicks" value={total.clk} hint={`${rate(total.clk, total.imp)} of impressions`} />
        <Stat label="Conversions" value={total.conv} hint="registrations, bookings, subscribers, purchases" />
        <Stat label="Attributed revenue" value={money(total.rev)} hint="verified payments, net of refunds" />
      </div>

      {rows.length ? (
        <Table head={["Pop-up", "Status", "Shows", "Impressions", "Clicks", "Dismissed", "Conversions", "Revenue", ""]}>
          {rows.map((p) => {
            const s = stats.get(p.id)!;
            const scheduled = p.starts_at && p.starts_at > new Date() ? `from ${when(p.starts_at)}` : null;
            const expired = p.ends_at && p.ends_at <= new Date();
            return (
              <tr key={p.id} className="hover:bg-muted/40">
                <Td>
                  <Link href={`/admin/website/popups/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  <div className="text-xs text-muted-foreground">{KIND[p.kind]}{p.event_title ? ` · ${p.event_title}` : ""} · priority {p.priority}</div>
                </Td>
                <Td>
                  <StatusBadge status={expired ? "ended" : p.status} tone={expired ? "amber" : p.status === "active" ? "green" : undefined} />
                  {scheduled && <div className="mt-1 text-xs text-muted-foreground">{scheduled}</div>}
                  {p.ends_at && !expired && <div className="mt-1 text-xs text-muted-foreground">until {when(p.ends_at)}</div>}
                  {p.event_status && p.event_status !== "published" && <div className="mt-1 text-xs text-amber-700">event {p.event_status}</div>}
                </Td>
                <Td className="text-xs">{p.pages === "all" ? "All pages" : p.pages === "home" ? "Homepage" : p.page_paths.join(", ")}<div className="text-muted-foreground">{p.devices === "all" ? "all devices" : p.devices}</div></Td>
                <Td>{s.impressions}<div className="text-xs text-muted-foreground">{s.visitors} visitor-days</div></Td>
                <Td>{s.clicks}<div className="text-xs text-muted-foreground">{rate(s.clicks, s.impressions)}</div></Td>
                <Td>{s.dismissals}</Td>
                <Td>{s.conversions}<div className="text-xs text-muted-foreground">{rate(s.conversions, s.visitors)}{s.paidOrders ? ` · ${s.paidOrders} paid` : ""}</div></Td>
                <Td>{s.revenueMinor ? formatMoney(s.revenueMinor, s.currency ?? biz.currency) : "—"}</Td>
                <Td className="whitespace-nowrap">
                  {p.status === "active"
                    ? <ActionButton key="pause" action={popupStatusAction} fields={{ id: p.id, status: "paused" }} label="Pause" success="Paused" />
                    : <ActionButton key="publish" action={popupStatusAction} fields={{ id: p.id, status: "active" }} label="Publish" variant="default" success="Published" />}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : <Empty title="No pop-ups yet" body="Start from one of the templates below. Nothing appears on the website until you publish it." />}

      <Panel title="Create a pop-up" description="Pick a starting point — everything can be changed, previewed on desktop and mobile, and published when you're happy.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map(([k, t, d]) => (
            <Link key={k} href={`/admin/website/popups/new?kind=${k}`} className="rounded-lg border p-4 transition hover:border-foreground">
              <p className="font-medium">{t}</p><p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Tip: on any masterclass, the <em>Website pop-up</em> switch creates its registration pop-up automatically. It hides itself when registration closes, the event is cancelled, unpublished or finished, or seats sell out (showing &ldquo;Join the waiting list&rdquo; instead if you allow one).</p>
      </Panel>
      <p className="text-xs text-muted-foreground">Conversions count real records only: confirmed registrations, confirmed bookings, confirmed newsletter subscribers and paid orders made after clicking the pop-up (within 30 days). Visitor-days are measured without cookies, so one person on two days counts twice. <LinkButton href="/admin/analytics" variant="link" size="xs">Website analytics →</LinkButton></p>
    </div>
  );
}
