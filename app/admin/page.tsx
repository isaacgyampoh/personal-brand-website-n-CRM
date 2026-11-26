import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { loadSettings } from "@/features/settings/application/settings";
import { resolveRange, growth } from "@/features/analytics/application/range";
import { dashboardData } from "@/features/analytics/application/dashboard";
import { integrationStatuses } from "@/lib/integrations/store";
import { onboardingSteps } from "@/features/studio/application/onboarding";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatInZone } from "@/lib/time";
import { PageTitle, Panel, Stat, StatusBadge, LinkButton, Notice } from "@/components/dashboard/ui";
import { RevenueChart } from "@/components/dashboard/charts";
import { RangeFilter } from "@/components/dashboard/range-filter";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; denied?: string }> }) {
  const user = await requireStaffPage("dashboard:view");
  const sp = await searchParams;
  const s = await loadSettings();
  const tz = s.business.timezone;
  const cur = s.business.currency;
  const range = resolveRange(sp, tz);
  const d = await dashboardData(range, tz);
  const money = (m: number) => formatMoney(m, cur);
  const conv = d.visitors.visitors ? (d.counts.paid_orders / d.visitors.visitors) * 100 : null;
  const int = await integrationStatuses();
  const onboardingLeft = user.permissions.has("settings:manage") ? (await onboardingSteps(user.id)).filter((x) => !x.optional && !x.done).length : 0;
  const missing = [int.paystack !== "connected" && "Paystack payments", int.smtp !== "connected" && "email (SMTP)", int.r2 !== "connected" && "Cloudflare R2 storage"].filter(Boolean);
  const a = d.attention;
  const attention = [
    a.needs_attention && { href: "/admin/payments?status=needs_attention", text: `${a.needs_attention} order(s) need attention`, tone: "red" },
    a.dead_jobs && { href: "/admin/system", text: `${a.dead_jobs} background job(s) failed permanently`, tone: "red" },
    a.failed_emails && { href: "/admin/system?tab=notifications", text: `${a.failed_emails} email(s) failed this week`, tone: "red" },
    a.tasks_due && { href: "/admin/tasks", text: `${a.tasks_due} task(s) due`, tone: "amber" },
    a.follow_ups && { href: "/admin/crm?filter=follow_up", text: `${a.follow_ups} contact follow-up(s) overdue`, tone: "amber" },
    a.new_enquiries && { href: "/admin/partnerships?tab=enquiries", text: `${a.new_enquiries} new enquiry/enquiries`, tone: "blue" },
    a.pending_testimonials && { href: "/admin/proof", text: `${a.pending_testimonials} testimonial(s) awaiting review`, tone: "blue" },
  ].filter(Boolean) as { href: string; text: string; tone: string }[];

  return (
    <div className="space-y-6">
      <PageTitle
        title={`Welcome back${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description={`${range.label} · figures from live records`}
        actions={<RangeFilter base="/admin" current={range.key} from={sp.from} to={sp.to} />}
      />
      {sp.denied && <Notice tone="red">You don&apos;t have permission to open that area.</Notice>}
      {user.permissions.has("settings:manage") && onboardingLeft > 0 && (
        <Notice tone="blue">{onboardingLeft} launch step(s) left. <Link href="/admin/onboarding" className="font-medium underline">Continue setup</Link></Notice>
      )}
      {missing.length > 0 && (
        <Notice>
          Setup incomplete: {missing.join(", ")} not connected yet.{" "}
          <Link href="/admin/settings/integrations" className="font-medium underline">Review integrations</Link>
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/admin/content/new" variant="outline" size="sm">+ Article</LinkButton>
        <LinkButton href="/admin/events/quick" variant="outline" size="sm">+ Masterclass</LinkButton>
        <LinkButton href="/admin/bookings/new" variant="outline" size="sm">+ Appointment</LinkButton>
        <LinkButton href="/admin/services/new" variant="outline" size="sm">+ Service</LinkButton>
        <LinkButton href="/admin/crm/new" variant="outline" size="sm">+ Contact</LinkButton>
        <LinkButton href="/admin/marketing/campaigns/new" variant="outline" size="sm">+ Campaign</LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net revenue" value={money(d.rev.net)} trend={growth(d.rev.net, d.prevRev.net)} hint={`vs previous period${d.rev.refunds ? ` · ${money(d.rev.refunds)} refunded` : ""}`} />
        <Stat label="This month" value={money(d.mtd)} hint="net of refunds" />
        <Stat label="New leads" value={d.counts.leads} trend={growth(d.counts.leads, d.prevCounts.leads)} hint="new contacts" />
        <Stat label="Customers" value={d.counts.customers} hint="all time" />
        <Stat label="Website visitors" value={d.visitors.visitors} trend={growth(d.visitors.visitors, d.prevVisitors)} hint={`${d.visitors.views} page views`} />
        <Stat label="Visitor → purchase" value={conv === null ? "—" : `${conv.toFixed(1)}%`} hint={`${d.counts.paid_orders} paid orders`} />
        <Stat label="Paid registrations" value={d.counts.paid_regs} hint={`${d.counts.bookings} bookings made`} />
        <Stat label="Active students" value={d.counts.active_students} hint={`${d.counts.pending_orders} payment(s) pending`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Revenue" description="Net daily revenue (payments minus refunds)" className="xl:col-span-2">
          <RevenueChart data={d.series} currency={cur} />
        </Panel>
        <Panel title="Needs attention">
          {attention.length ? (
            <ul className="space-y-2">
              {attention.map((x) => (
                <li key={x.href}><Link href={x.href} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-muted">
                  <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${x.tone === "red" ? "bg-red-500" : x.tone === "amber" ? "bg-amber-500" : "bg-sky-500"}`} />{x.text}</span><span aria-hidden>→</span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">All clear. Nothing needs your attention.</p>}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Upcoming appointments" actions={<Link href="/admin/bookings" className="text-xs text-muted-foreground hover:text-foreground">All →</Link>}>
          {d.upcomingAppts.length ? (
            <ul className="divide-y">
              {d.upcomingAppts.map((x) => (
                <li key={x.id}><Link href={`/admin/bookings/${x.id}`} className="flex items-center justify-between gap-4 py-2.5 text-sm hover:text-foreground">
                  <span className="min-w-0"><span className="block truncate font-medium">{x.name}</span><span className="text-xs text-muted-foreground">{x.service}</span></span>
                  <span className="shrink-0 text-right text-xs">{formatDateTime(x.starts_at, tz)}</span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No upcoming appointments.</p>}
        </Panel>
        <Panel title="Upcoming masterclasses" actions={<Link href="/admin/events" className="text-xs text-muted-foreground hover:text-foreground">All →</Link>}>
          {d.upcomingEvents.length ? (
            <ul className="divide-y">
              {d.upcomingEvents.map((e) => (
                <li key={e.id}><Link href={`/admin/events/${e.id}`} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{e.title}</span><span className="text-xs text-muted-foreground">{formatInZone(e.starts_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
                  <span className="shrink-0 text-right text-xs"><span className="block font-medium">{e.sold}{e.capacity ? ` / ${e.capacity}` : ""} seats</span><span className="text-muted-foreground">{money(e.revenue)}</span></span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No published upcoming events. <Link href="/admin/events/new" className="underline">Create one</Link>.</p>}
        </Panel>
        <Panel title="Recent transactions" actions={<Link href="/admin/payments" className="text-xs text-muted-foreground hover:text-foreground">All →</Link>}>
          {d.recentTx.length ? (
            <ul className="divide-y">
              {d.recentTx.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{t.customer}</span><span className="text-xs text-muted-foreground">{t.reference} · <StatusBadge status={t.kind} tone={t.amount_minor < 0 ? "violet" : "green"} /></span></span>
                  <span className={`shrink-0 font-medium tabular-nums ${t.amount_minor < 0 ? "text-red-600" : ""}`}>{formatMoney(t.amount_minor, t.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No transactions yet.</p>}
        </Panel>
        <Panel title="Recent activity" actions={<Link href="/admin/crm" className="text-xs text-muted-foreground hover:text-foreground">CRM →</Link>}>
          {d.activity.length ? (
            <ul className="divide-y">
              {d.activity.map((x) => (
                <li key={x.id}><Link href={`/admin/crm/${x.contact_id}`} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">{x.title}</span><span className="text-xs text-muted-foreground">{x.name}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatInZone(x.occurred_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Activity from forms, bookings and purchases will appear here.</p>}
        </Panel>
      </div>
    </div>
  );
}
