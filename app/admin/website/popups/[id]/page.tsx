import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSettings } from "@/features/settings/application/settings";
import { getPopup, popupStats, rate } from "@/features/popups/application/popups";
import { deletePopupAction, popupStatusAction } from "@/features/popups/presentation/actions";
import { FONT_PAIRS } from "@/lib/fonts";
import { formatInZone, toLocalInput } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { PageTitle, Panel, Stat, StatusBadge, Notice } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";
import { PopupEditor, type PopupFormValues } from "@/components/dashboard/popup-editor";

export const metadata = { title: "Pop-up" };
export const dynamic = "force-dynamic";

const KINDS = ["event", "announcement", "coaching", "course", "offer", "newsletter", "resource", "custom"];
const DEFAULTS: Record<string, Partial<PopupFormValues>> = {
  event: { name: "Masterclass registration", layout: "countdown", priority: "10" },
  coaching: { name: "Coaching promotion", layout: "editorial", heading: "Ready to be seen on LinkedIn?", buttonText: "Book a discovery call", destination: "/services" },
  newsletter: { name: "Newsletter", layout: "minimal", heading: "LinkedIn visibility tips, straight to your inbox", buttonText: "Subscribe", frequency: "dismiss_period", dismissDays: "30" },
  resource: { name: "Free resource", layout: "editorial", buttonText: "Download free" },
  offer: { name: "Special offer", layout: "editorial", buttonText: "Claim the offer" },
  course: { name: "New course", layout: "editorial", buttonText: "See the course" },
  announcement: { name: "Upcoming event", layout: "minimal", buttonText: "Find out more" },
  custom: { name: "Announcement", layout: "minimal" },
};

export default async function PopupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  await requireStaffPage("website:edit", "/admin/website/popups");
  const { id } = await params;
  const isNew = id === "new";
  const row = isNew ? null : /^[0-9a-f-]{36}$/.test(id) ? await getPopup(id) : null;
  if (!isNew && !row) notFound();
  const s = await loadSettings();
  const tz = s.business.timezone;
  const events = await db.query<{ id: string; title: string; starts_at: Date; status: string }>(
    `select id, title, starts_at, status from events where status in ('draft','published') and ends_at > now() - interval '1 day' order by starts_at limit 100`,
  );
  const kind = isNew ? (KINDS.includes((await searchParams).kind ?? "") ? (await searchParams).kind! : "custom") : row!.kind;
  const d = DEFAULTS[kind] ?? {};
  const initial: PopupFormValues = row ? {
    id: row.id, name: row.name, kind: row.kind, eventId: row.event_id ?? "", layout: row.layout, eyebrow: row.eyebrow, heading: row.heading, body: row.body,
    buttonText: row.button_text, destination: row.destination, imageMediaId: row.image_media_id ?? "", accent: row.colors.accent ?? "", background: row.colors.background ?? "",
    text: row.colors.text ?? "", pages: row.pages, pagePaths: row.page_paths.join("\n"), devices: row.devices, delaySeconds: String(row.delay_seconds),
    frequency: row.frequency, dismissDays: String(row.dismiss_days), priority: String(row.priority), startsAt: toLocalInput(row.starts_at, tz), endsAt: toLocalInput(row.ends_at, tz),
  } : {
    id: "", name: "", kind, eventId: "", layout: "editorial", eyebrow: "", heading: "", body: "", buttonText: "", destination: "", imageMediaId: "",
    accent: "", background: "", text: "", pages: "all", pagePaths: "", devices: "all", delaySeconds: "5", frequency: "dismiss_period", dismissDays: "7",
    priority: "0", startsAt: "", endsAt: "", ...d,
  } as PopupFormValues;

  const pair = FONT_PAIRS[s.theme.fontPair];
  const theme = {
    "--ink": s.theme.ink, "--paper": s.theme.paper, "--brand-accent": s.theme.accent, "--brand-accent-ink": s.theme.accentInk,
    "--site-display": pair.display, "--site-body": pair.body, "--site-radius": s.theme.corners === "soft" ? "6px" : "0px",
  } as React.CSSProperties;

  const stats = row ? (await popupStats(new Date(Date.now() - 30 * 86400_000), new Date(Date.now() + 60_000), [row.id])).get(row.id) : null;
  const expired = row?.ends_at && row.ends_at <= new Date();

  return (
    <div className="space-y-6">
      <PageTitle title={row ? row.name : "New pop-up"} back={{ href: "/admin/website/popups", label: "Pop-ups & campaigns" }}
        description={row ? undefined : "Fill in the details and watch the preview. It is saved as a draft — nothing shows on the website until you publish."}
        actions={row ? <>
          <StatusBadge status={expired ? "ended" : row.status} tone={expired ? "amber" : undefined} />
          {row.status === "active"
            ? <ActionButton key="pause" action={popupStatusAction} fields={{ id: row.id, status: "paused" }} label="Pause" success="Paused — no longer shown" />
            : <ActionButton key="publish" action={popupStatusAction} fields={{ id: row.id, status: "active" }} label="Publish" variant="default" success="Published — live on the website" />}
          <ActionButton action={deletePopupAction} fields={{ id: row.id }} label="Delete" variant="destructive" confirm="Delete this pop-up and its statistics?" success="Deleted" />
        </> : undefined} />
      {expired && <Notice tone="amber">The end date has passed, so this pop-up no longer shows. Change &ldquo;Stop showing&rdquo; to run it again.</Notice>}
      {stats && (
        <Panel title="Last 30 days">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Impressions" value={stats.impressions} hint={`${stats.visitors} visitor-days`} />
            <Stat label="Clicks" value={stats.clicks} hint={`${rate(stats.clicks, stats.impressions)} click rate`} />
            <Stat label="Dismissed" value={stats.dismissals} />
            <Stat label="Conversions" value={stats.conversions} hint={`${rate(stats.conversions, stats.visitors)} of visitors`} />
            <Stat label="Paid orders" value={stats.paidOrders} />
            <Stat label="Revenue" value={formatMoney(stats.revenueMinor, stats.currency ?? s.business.currency)} hint="verified payments" />
          </div>
        </Panel>
      )}
      <PopupEditor initial={initial} theme={theme}
        events={events.map((e) => ({ id: e.id, label: `${e.title} — ${formatInZone(e.starts_at, tz, { day: "numeric", month: "short", year: "numeric" })}${e.status === "draft" ? " (draft)" : ""}` }))} />
    </div>
  );
}
