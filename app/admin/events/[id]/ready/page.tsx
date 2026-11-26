import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { publicMediaUrl } from "@/lib/storage";
import { formatDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { eventStatusAction } from "@/features/events/presentation/admin-actions";
import { PageTitle, Panel, LinkButton, Notice, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";
import { CopyButton } from "@/components/dashboard/copy-button";

export const metadata = { title: "Masterclass ready" };
export const dynamic = "force-dynamic";

/** After quick-create: preview, publish, copy/share the link, and see how the link preview will look. */
export default async function Ready({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("events:manage");
  const { id } = await params;
  const e = await db.one<{ id: string; slug: string; title: string; summary: string; status: string; starts_at: Date; timezone: string; flyer_key: string | null; meeting_provider: string | null; meeting_url: string | null }>(
    `select e.id, e.slug, e.title, e.summary, e.status, e.starts_at, e.timezone, m.storage_key as flyer_key, a.meeting_provider, a.meeting_url
       from events e left join media_assets m on m.id = coalesce(e.flyer_media_id, e.cover_media_id) left join event_access a on a.event_id = e.id where e.id = $1`, [id]);
  if (!e) notFound();
  const tickets = await db.query<{ name: string; price_minor: number; currency: string; sales_end_at: Date | null }>("select name, price_minor, currency, sales_end_at from ticket_types where event_id = $1 order by position", [id]);
  const url = `${env().APP_URL}/masterclasses/${e.slug}`;
  const img = e.flyer_key ? publicMediaUrl(e.flyer_key) : null;
  const published = e.status === "published";
  const share = encodeURIComponent(`${e.title} — ${url}`);
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title={published ? "Your masterclass is live" : "Draft saved"} description={`${e.title} · ${formatDateTime(e.starts_at, e.timezone)}`} back={{ href: `/admin/events/${id}`, label: "Edit details" }} actions={<StatusBadge status={e.status} />} />
      {!published && <Notice tone="blue">Preview it, then publish when you&apos;re happy. Nobody can register until it&apos;s published.</Notice>}
      {(e.meeting_provider === "zoom" || e.meeting_provider === "google_meet") && !e.meeting_url && <Notice tone="blue">The {e.meeting_provider === "zoom" ? "Zoom" : "Google Meet"} meeting is being created in the background. Refresh in a moment to see it on the event page.</Notice>}
      <Panel title="Link">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-sm">{url}</code>
          <CopyButton text={url} label="Copy link" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton href={`/masterclasses/${e.slug}${published ? "" : "?preview=1"}`} variant="outline" size="sm" target="_blank">{published ? "View page" : "Preview"}</LinkButton>
          {!published && <ActionButton action={eventStatusAction} fields={{ id, op: "publish" }} label="Publish now" variant="default" success="Published" />}
          {published && <>
            <LinkButton href={`https://wa.me/?text=${share}`} variant="outline" size="sm" target="_blank">Share on WhatsApp</LinkButton>
            <LinkButton href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} variant="outline" size="sm" target="_blank">Share on LinkedIn</LinkButton>
            <LinkButton href={`/admin/marketing?tab=links&dest=${encodeURIComponent(`/masterclasses/${e.slug}`)}`} variant="outline" size="sm">Create tracked campaign link</LinkButton>
          </>}
        </div>
      </Panel>
      <Panel title="Link preview" description="Roughly how the link looks when shared on WhatsApp, LinkedIn or Facebook.">
        <div className="max-w-sm overflow-hidden rounded-lg border">
          {img ? <img src={img} alt="" className="aspect-[1.91/1] w-full object-cover" /> : <div className="grid aspect-[1.91/1] place-items-center bg-muted text-xs text-muted-foreground">No flyer — the site&apos;s default image is used</div>}
          <div className="p-3"><p className="text-xs text-muted-foreground">{new URL(url).host}</p><p className="text-sm font-semibold">{e.title}</p><p className="line-clamp-2 text-xs text-muted-foreground">{e.summary}</p></div>
        </div>
      </Panel>
      <Panel title="Tickets">
        <ul className="divide-y text-sm">{tickets.map((t) => <li key={t.name} className="flex justify-between py-2"><span>{t.name}{t.sales_end_at && <span className="block text-xs text-muted-foreground">until {formatDateTime(t.sales_end_at, e.timezone)}</span>}</span><span>{t.price_minor ? formatMoney(t.price_minor, t.currency) : "Free"}</span></li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">Discount codes, complimentary tickets and more ticket types: <a className="underline" href={`/admin/events/${id}`}>edit the masterclass</a>.</p>
      </Panel>
    </div>
  );
}
