import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { subscriberCounts } from "@/features/marketing/application/subscribers";
import { loadSetting } from "@/features/settings/application/settings";
import { saveDiscountAction, saveLinkAction, toggleDiscountAction, toggleLinkAction } from "@/features/marketing/presentation/actions";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { PageTitle, Panel, Stat, Table, Td, StatusBadge, LinkButton } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/dashboard/forms";
import { CopyButton } from "@/components/dashboard/copy-button";

export const metadata = { title: "Marketing" };
const TABS = [["campaigns", "Email campaigns"], ["links", "Tracked links & attribution"], ["subscribers", "Subscribers"], ["discounts", "Discount codes"]] as const;

export default async function Marketing({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("marketing:manage");
  const tab = (await searchParams).tab ?? "campaigns";
  const [counts, biz] = await Promise.all([subscriberCounts(), loadSetting("business")]);
  const base = env().APP_URL;
  return (
    <div className="space-y-6">
      <PageTitle title="Marketing" description="Consent-based email, campaign attribution and promotions." />
      <div className="grid grid-cols-3 gap-3"><Stat label="Subscribed" value={counts?.subscribed ?? 0} hint="double opt-in confirmed" /><Stat label="Pending confirmation" value={counts?.pending ?? 0} /><Stat label="Unsubscribed" value={counts?.unsubscribed ?? 0} /></div>
      <nav className="flex gap-1 overflow-x-auto border-b">{TABS.map(([k, l]) => <Link key={k} href={`/admin/marketing?tab=${k}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}>{l}</Link>)}</nav>

      {tab === "campaigns" && <Campaigns tz={biz.timezone} />}
      {tab === "links" && <Links base={base} currency={biz.currency} />}
      {tab === "subscribers" && <Subscribers tz={biz.timezone} />}
      {tab === "discounts" && <Discounts currency={biz.currency} />}
    </div>
  );

  async function Campaigns({ tz }: { tz: string }) {
    const rows = await db.query<{ id: string; name: string; subject: string; status: string; scheduled_at: Date | null; sent_at: Date | null; recipients: number }>(
      "select c.*, (select count(*) from campaign_recipients r where r.campaign_id = c.id)::int as recipients from campaigns c order by c.created_at desc limit 100");
    return (
      <div className="space-y-4">
        <LinkButton href="/admin/marketing/campaigns/new">New campaign</LinkButton>
        <Table head={["Campaign", "Status", "Recipients", "When"]}>
          {rows.map((c) => <tr key={c.id}><Td><Link href={`/admin/marketing/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link><div className="text-xs text-muted-foreground">{c.subject}</div></Td><Td><StatusBadge status={c.status} /></Td><Td>{c.recipients}</Td><Td className="text-xs">{c.sent_at ? formatInZone(c.sent_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : c.scheduled_at ? `Scheduled ${formatInZone(c.scheduled_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "—"}</Td></tr>)}
        </Table>
      </div>
    );
  }

  async function Links({ base, currency }: { base: string; currency: string }) {
    const rows = await db.query<{ id: string; slug: string; name: string; destination: string; channel: string; active: boolean; clicks: number; leads: number; orders: number; revenue: number; bookings: number; registrations: number }>(
      `select l.*, (select count(*) from link_clicks c where c.link_id = l.id)::int as clicks,
         (select count(*) from contacts c where c.attribution->>'linkId' = l.id::text)::int as leads,
         (select count(*) from orders o where o.attribution->>'linkId' = l.id::text and o.status in ('paid','partially_refunded'))::int as orders,
         (select coalesce(sum(o.total_minor - o.refunded_minor),0) from orders o where o.attribution->>'linkId' = l.id::text and o.status in ('paid','partially_refunded','refunded'))::bigint as revenue,
         (select count(*) from appointments a where a.attribution->>'linkId' = l.id::text and a.status in ('confirmed','completed'))::int as bookings,
         (select count(*) from event_registrations r where r.attribution->>'linkId' = l.id::text and r.status = 'confirmed')::int as registrations
       from campaign_links l order by l.created_at desc`);
    const utm = await db.query<{ source: string; campaign: string | null; orders: number; revenue: number }>(
      `select coalesce(attribution->>'utm_source','(direct)') as source, attribution->>'utm_campaign' as campaign, count(*)::int as orders, sum(total_minor - refunded_minor)::bigint as revenue
         from orders where status in ('paid','partially_refunded') group by 1,2 order by revenue desc limit 15`);
    return (
      <div className="space-y-6">
        <Panel title="Create a branded link" description="Share these on LinkedIn, Instagram or in emails to see which posts drive bookings, registrations and revenue.">
          <ActionForm action={saveLinkAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" name="name" required placeholder="LinkedIn post — Dec masterclass" />
            <Field label="Destination" name="destination" required placeholder="/masterclasses/…" />
            <Select label="Channel" name="channel" options={[["linkedin", "LinkedIn"], ["instagram", "Instagram"], ["x", "X"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["email", "Email"], ["whatsapp_share", "WhatsApp share"], ["referral", "Referral"], ["other", "Other"]] as const} />
            <Field label="Short code (optional)" name="slug" />
            <Field label="Campaign name (optional)" name="utmCampaign" />
            <Field label="Referrer email (referral links)" name="referrerEmail" />
            <div><Submit>Create link</Submit></div>
          </ActionForm>
        </Panel>
        <Table head={["Link", "Clicks", "Leads", "Bookings", "Registrations", "Paid orders", "Revenue", ""]}>
          {rows.map((l) => (
            <tr key={l.id}>
              <Td><span className="font-medium">{l.name}</span><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-mono">{base}/go/{l.slug}</span><CopyButton text={`${base}/go/${l.slug}`} /></div><div className="text-xs text-muted-foreground">→ {l.destination} · {l.channel}</div></Td>
              <Td>{l.clicks}</Td><Td>{l.leads}</Td><Td>{l.bookings}</Td><Td>{l.registrations}</Td><Td>{l.orders}</Td>
              <Td className="tabular-nums">{formatMoney(l.revenue, currency)}</Td>
              <Td><ActionButton action={toggleLinkAction} fields={{ id: l.id }} label={l.active ? "Disable" : "Enable"} /></Td>
            </tr>
          ))}
        </Table>
        <Panel title="Revenue by source (UTM)">
          {utm.length ? <ul className="divide-y text-sm">{utm.map((u, i) => <li key={i} className="flex justify-between py-2"><span>{u.source}{u.campaign ? ` / ${u.campaign}` : ""}</span><span>{u.orders} orders · {formatMoney(u.revenue, currency)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No attributed orders yet.</p>}
        </Panel>
      </div>
    );
  }

  async function Subscribers({ tz }: { tz: string }) {
    const rows = await db.query<{ email: string; full_name: string; status: string; source: string; confirmed_at: Date | null; created_at: Date }>("select * from subscribers order by created_at desc limit 300");
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Subscribers join through double opt-in. Imported contacts are never auto-subscribed.</p>
        <Table head={["Email", "Status", "Source", "Joined"]}>
          {rows.map((s) => <tr key={s.email}><Td>{s.email}<div className="text-xs text-muted-foreground">{s.full_name}</div></Td><Td><StatusBadge status={s.status} /></Td><Td className="text-xs">{s.source}</Td><Td className="text-xs">{formatInZone(s.confirmed_at ?? s.created_at, tz, { day: "numeric", month: "short", year: "numeric" })}</Td></tr>)}
        </Table>
      </div>
    );
  }

  async function Discounts({ currency }: { currency: string }) {
    const rows = await db.query<{ id: string; code: string; kind: string; value: number; currency: string | null; applies_to: string; redemptions_count: number; max_redemptions: number | null; active: boolean; ends_at: Date | null }>("select * from discount_codes order by created_at desc");
    return (
      <div className="space-y-6">
        <Panel title="New discount code">
          <ActionForm action={saveDiscountAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
            <Field label="Code" name="code" required placeholder="EARLYBIRD" />
            <Select label="Type" name="kind" options={[["percent", "Percent off"], ["fixed", "Fixed amount off"]] as const} />
            <Field label="Value (% or amount)" name="value" required />
            <Field label="Currency (fixed)" name="currency" defaultValue={currency} />
            <Select label="Applies to" name="appliesTo" options={[["all", "Everything"], ["event_ticket", "Masterclass tickets"], ["appointment", "Appointments"], ["course", "Courses"], ["product", "Products"]] as const} />
            <Field label="Max uses (blank = unlimited)" name="maxRedemptions" type="number" />
            <Field label="Uses per customer" name="perCustomerLimit" type="number" defaultValue={1} />
            <Field label="Description" name="description" />
            <Field label="Valid from" name="startsAt" type="datetime-local" />
            <Field label="Valid until" name="endsAt" type="datetime-local" />
            <div className="flex items-end"><Submit>Create code</Submit></div>
          </ActionForm>
        </Panel>
        <Table head={["Code", "Discount", "Applies to", "Used", "Status", ""]}>
          {rows.map((d) => <tr key={d.id}><Td className="font-mono font-medium">{d.code}</Td><Td>{d.kind === "percent" ? `${d.value}%` : formatMoney(d.value, d.currency ?? currency)}</Td><Td className="text-xs">{d.applies_to.replace("_", " ")}</Td><Td>{d.redemptions_count}{d.max_redemptions ? ` / ${d.max_redemptions}` : ""}</Td><Td><StatusBadge status={d.active ? "active" : "archived"} /></Td><Td><ActionButton action={toggleDiscountAction} fields={{ id: d.id }} label={d.active ? "Deactivate" : "Activate"} /></Td></tr>)}
        </Table>
      </div>
    );
  }
}
