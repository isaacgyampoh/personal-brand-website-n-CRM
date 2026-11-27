import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/database/pool";
import { TAGS } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { publicMediaUrl, primeMedia } from "@/lib/storage";
import { formatInZone } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { ticketOnSale } from "@/features/events/domain/rules";
import { eventRepo, remainingFor, type EventRow } from "@/features/events/infrastructure/repository";
import { srcSetsFor } from "@/features/media/application/srcset";
import { eventPopupState, pathTargeted, seatsLabel, type PopupInput, type PopupKind, type PopupLayout, type PublicPopup } from "../domain/popups";

export type PopupRow = {
  id: string; name: string; kind: PopupKind; event_id: string | null; layout: PopupLayout; eyebrow: string; heading: string; body: string;
  button_text: string; destination: string; image_media_id: string | null; colors: { accent?: string; background?: string; text?: string };
  pages: "all" | "home" | "selected"; page_paths: string[]; devices: "all" | "mobile" | "desktop"; delay_seconds: number;
  frequency: "session" | "dismiss_period" | "every_page"; dismiss_days: number; priority: number;
  starts_at: Date | null; ends_at: Date | null; status: "draft" | "active" | "paused"; created_at: Date; updated_at: Date;
};

const EVENT_KIND_LABEL: Record<string, string> = {
  masterclass: "Live masterclass", webinar: "Live webinar", workshop: "Workshop", group_coaching: "Group coaching",
  programme: "Programme", conference: "Conference", other: "Upcoming event",
};

type Targeted = { popup: PublicPopup; pages: PopupRow["pages"]; pagePaths: string[] };

/**
 * Builds the browser payload for one pop-up from live data. Returns null when it
 * must not be shown (e.g. event registration closed / sold out without waitlist).
 * `preview` skips the schedule and status checks (Studio preview only).
 */
export async function buildPopup(p: PopupRow, opts: { preview?: boolean; now?: Date } = {}): Promise<PublicPopup | null> {
  const now = opts.now ?? new Date();
  let imageKey: string | null = null;
  let imageAlt = "";
  if (p.image_media_id) {
    const m = await db.one<{ storage_key: string; alt_text: string }>("select storage_key, alt_text from media_assets where id = $1 and deleted_at is null and visibility = 'public'", [p.image_media_id]);
    if (m) { imageKey = m.storage_key; imageAlt = m.alt_text; }
  }
  const base: PublicPopup = {
    id: p.id, kind: p.kind, layout: p.layout, eyebrow: p.eyebrow, heading: p.heading, body: p.body,
    buttonText: p.button_text, href: p.destination, image: null, colors: p.colors ?? {},
    devices: p.devices, delaySeconds: p.delay_seconds, frequency: p.frequency, dismissDays: p.dismiss_days,
  };

  if (p.kind === "event" && p.event_id) {
    const e = await db.one<EventRow & { flyer_key: string | null; cover_key: string | null; flyer_alt: string | null }>(
      `select e.*, f.storage_key as flyer_key, f.alt_text as flyer_alt, c.storage_key as cover_key
         from events e
         left join media_assets f on f.id = e.flyer_media_id and f.deleted_at is null and f.visibility = 'public'
         left join media_assets c on c.id = e.cover_media_id and c.deleted_at is null and c.visibility = 'public'
        where e.id = $1`, [p.event_id]);
    if (!e) return null;
    const [tickets, counts] = await Promise.all([eventRepo.tickets(e.id), eventRepo.seatCounts(e.id)]);
    const onSale = tickets.filter((t) => ticketOnSale(t, now));
    const remaining = onSale.map((t) => remainingFor(e, t, counts));
    const seatsLeft = !onSale.length ? 0 : remaining.some((r) => r === null) ? (e.capacity === null ? null : Math.max(0, e.capacity - counts.total))
      : Math.min(remaining.reduce<number>((s, r) => s + (r ?? 0), 0), e.capacity === null ? Infinity : Math.max(0, e.capacity - counts.total));
    const state = eventPopupState({ ...e, seatsLeft, ticketsOnSale: onSale.length }, now);
    if (state === "hidden" && !opts.preview) return null;
    const prices = onSale.map((t) => t.price_minor);
    const min = prices.length ? Math.min(...prices) : 0;
    const currency = onSale[0]?.currency ?? "GHS";
    const priceLabel = !prices.length || Math.max(...prices) === 0 ? "Free" : prices.length > 1 && new Set(prices).size > 1 ? `From ${formatMoney(min, currency)}` : formatMoney(min, currency);
    const closes = e.registration_closes_at ?? e.starts_at;
    const free = priceLabel === "Free";
    if (!imageKey) { imageKey = e.flyer_key ?? e.cover_key; imageAlt = e.flyer_alt ?? `${e.title} flyer`; }
    Object.assign(base, {
      eyebrow: p.eyebrow || EVENT_KIND_LABEL[e.kind] || "Upcoming event",
      heading: p.heading || e.title,
      body: p.body || e.summary || e.subtitle,
      buttonText: state === "waitlist" ? "Join the waiting list" : p.button_text || (free ? "Reserve your free seat" : "Register now"),
      href: `/masterclasses/${e.slug}#register`,
      excludePath: `/masterclasses/${e.slug}`,
      event: {
        slug: e.slug, startsAt: new Date(e.starts_at).toISOString(), timezone: e.timezone,
        dateLabel: formatInZone(new Date(e.starts_at), e.timezone, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
        deadlineLabel: e.registration_closes_at ? `Registration closes ${formatInZone(new Date(e.registration_closes_at), e.timezone, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : null,
        priceLabel, seatsLabel: state === "waitlist" ? "Fully booked" : seatsLabel(seatsLeft), countdownTo: new Date(closes).toISOString(),
      },
    } satisfies Partial<PublicPopup>);
  }

  if (imageKey) {
    await primeMedia();
    const src = publicMediaUrl(imageKey);
    const sets = await srcSetsFor([src]);
    base.image = { src, srcSet: sets[src], alt: imageAlt };
  }
  if (!base.heading) return null;
  return base;
}

/** All pop-ups that may show right now, highest priority first. Cached briefly; publishes clear it at once. */
const livePopups = unstable_cache(async (): Promise<Targeted[]> => {
  const rows = await db.query<PopupRow>(
    `select * from site_popups
      where status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      order by priority desc, updated_at desc limit 25`,
  );
  const out: Targeted[] = [];
  for (const r of rows) {
    const built = await buildPopup(r).catch((e) => { console.error("[popups] build failed", r.id, (e as Error).message); return null; });
    if (built) out.push({ popup: built, pages: r.pages, pagePaths: r.page_paths });
  }
  return out;
}, ["popups:live:v1"], { tags: [TAGS.popups, TAGS.events], revalidate: 20 });

/** Candidates for one page, in priority order. The browser shows the first one that its frequency rules allow. */
export async function popupsForPath(path: string): Promise<PublicPopup[]> {
  const all = await livePopups();
  return all
    .filter((t) => pathTargeted({ pages: t.pages, page_paths: t.pagePaths }, path) && t.popup.excludePath !== path.replace(/\/$/, ""))
    .slice(0, 5)
    .map((t) => t.popup);
}

export async function isLivePopup(id: string): Promise<boolean> {
  return (await livePopups()).some((t) => t.popup.id === id);
}

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------
export function getPopup(id: string) {
  return db.one<PopupRow>("select * from site_popups where id = $1", [id]);
}

export async function savePopup(id: string | null, v: PopupInput & { startsAt: Date | null; endsAt: Date | null }, actorId: string): Promise<string> {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) throw new UserError("The end date must be after the start date.");
  if (v.kind === "event") {
    const e = await db.one<{ id: string }>("select id from events where id = $1", [v.eventId]);
    if (!e) throw new UserError("That event no longer exists.");
    const clash = await db.one<{ id: string }>("select id from site_popups where event_id = $1 and ($2::uuid is null or id <> $2)", [v.eventId, id]);
    if (clash) throw new UserError("This event already has a pop-up — edit that one instead.");
  }
  const colors = Object.fromEntries(Object.entries({ accent: v.accent, background: v.background, text: v.text }).filter(([, c]) => c));
  const params = [v.name, v.kind, v.kind === "event" ? v.eventId : null, v.layout, v.eyebrow, v.heading, v.body, v.buttonText, v.destination,
    v.imageMediaId || null, JSON.stringify(colors), v.pages, v.pagePaths, v.devices, v.delaySeconds, v.frequency, v.dismissDays, v.priority, v.startsAt, v.endsAt];
  const row = id
    ? await db.one<{ id: string }>(
      `update site_popups set name=$1, kind=$2, event_id=$3, layout=$4, eyebrow=$5, heading=$6, body=$7, button_text=$8, destination=$9, image_media_id=$10,
         colors=$11, pages=$12, page_paths=$13, devices=$14, delay_seconds=$15, frequency=$16, dismiss_days=$17, priority=$18, starts_at=$19, ends_at=$20
       where id = $21 returning id`, [...params, id])
    : await db.one<{ id: string }>(
      `insert into site_popups (name, kind, event_id, layout, eyebrow, heading, body, button_text, destination, image_media_id, colors, pages, page_paths,
         devices, delay_seconds, frequency, dismiss_days, priority, starts_at, ends_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning id`, [...params, actorId]);
  if (!row) throw new UserError("Pop-up not found.");
  await audit({ actorId, action: id ? "popup.update" : "popup.create", entityType: "popup", entityId: row.id });
  return row.id;
}

export async function setPopupStatus(id: string, status: "active" | "paused", actorId: string) {
  const r = await db.one<{ id: string }>("update site_popups set status = $2 where id = $1 returning id", [id, status]);
  if (!r) throw new UserError("Pop-up not found.");
  await audit({ actorId, action: status === "active" ? "popup.publish" : "popup.pause", entityType: "popup", entityId: id });
}

export async function deletePopup(id: string, actorId: string) {
  await db.query("delete from site_popups where id = $1", [id]);
  await audit({ actorId, action: "popup.delete", entityType: "popup", entityId: id });
}

/** "Show a pop-up for this event" switch on the event page. Creates the pop-up the first time. */
export async function setEventPopup(eventId: string, on: boolean, actorId: string): Promise<string | null> {
  const existing = await db.one<{ id: string }>("select id from site_popups where event_id = $1", [eventId]);
  if (existing) { await setPopupStatus(existing.id, on ? "active" : "paused", actorId); return existing.id; }
  if (!on) return null;
  const e = await db.one<{ title: string }>("select title from events where id = $1", [eventId]);
  if (!e) throw new UserError("Event not found.");
  const row = await db.one<{ id: string }>(
    `insert into site_popups (name, kind, event_id, layout, status, priority, created_by) values ($1, 'event', $2, 'countdown', 'active', 10, $3) returning id`,
    [`${e.title} — registration`.slice(0, 120), eventId, actorId]);
  await audit({ actorId, action: "popup.create", entityType: "popup", entityId: row!.id, data: { eventId } });
  return row!.id;
}

export type PopupStats = {
  impressions: number; visitors: number; clicks: number; dismissals: number;
  registrations: number; bookings: number; subscribers: number; paidOrders: number; revenueMinor: number; currency: string | null;
  conversions: number;
};

/** Real performance per pop-up for a period. Conversions come from records carrying the pop-up attribution. */
export async function popupStats(from: Date, to: Date, ids?: string[]): Promise<Map<string, PopupStats>> {
  const rows = await db.query<{ id: string } & Omit<PopupStats, "conversions">>(
    `select p.id,
       coalesce(ev.impressions,0)::int as impressions, coalesce(ev.visitors,0)::int as visitors, coalesce(ev.clicks,0)::int as clicks, coalesce(ev.dismissals,0)::int as dismissals,
       (select count(*) from event_registrations r where r.attribution->>'popupId' = p.id::text and r.status = 'confirmed' and r.created_at >= $1 and r.created_at < $2)::int as registrations,
       (select count(*) from appointments a where a.attribution->>'popupId' = p.id::text and a.status in ('confirmed','completed') and a.created_at >= $1 and a.created_at < $2)::int as bookings,
       (select count(*) from subscribers s where s.source = 'p:' || p.id::text and s.status = 'subscribed' and s.created_at >= $1 and s.created_at < $2)::int as subscribers,
       (select count(*) from orders o where o.attribution->>'popupId' = p.id::text and o.paid_at is not null and o.total_minor > 0 and o.paid_at >= $1 and o.paid_at < $2)::int as "paidOrders",
       (select coalesce(sum(o.total_minor - o.refunded_minor),0) from orders o where o.attribution->>'popupId' = p.id::text and o.paid_at is not null and o.paid_at >= $1 and o.paid_at < $2)::bigint as "revenueMinor",
       (select min(o.currency) from orders o where o.attribution->>'popupId' = p.id::text and o.paid_at is not null) as currency
     from site_popups p
     left join (
       select popup_id,
         count(*) filter (where name = 'impression') as impressions,
         count(distinct (visitor_hash, occurred_at::date)) filter (where name = 'impression') as visitors,
         count(*) filter (where name = 'click') as clicks,
         count(*) filter (where name = 'dismiss') as dismissals
       from popup_events where occurred_at >= $1 and occurred_at < $2 group by popup_id
     ) ev on ev.popup_id = p.id
     where ($3::uuid[] is null or p.id = any($3))`,
    [from, to, ids ?? null],
  );
  // Paid event tickets appear as both a registration and an order: count the person once.
  const nonEventOrders = await db.query<{ id: string; n: number }>(
    `select o.attribution->>'popupId' as id, count(*)::int as n from orders o
      where o.attribution ? 'popupId' and o.paid_at >= $1 and o.paid_at < $2 and o.total_minor > 0
        and not exists (select 1 from event_registrations r where r.order_id = o.id)
      group by 1`, [from, to]);
  const extra = new Map(nonEventOrders.map((r) => [r.id, r.n]));
  return new Map(rows.map((r) => [r.id, { ...r, revenueMinor: Number(r.revenueMinor), conversions: r.registrations + r.bookings + r.subscribers + (extra.get(r.id) ?? 0) }]));
}

export function rate(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
}
