import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/database/pool";
import { primeMedia, publicMediaUrl, withMedia } from "@/lib/storage";
import { TAGS } from "@/lib/cache";
import { PUBLIC_EVENT_COLUMNS } from "@/features/events/infrastructure/repository";
import { publishedPage } from "./pages";
import { publishedArticles, publishedArticle, relatedArticles, type ArticleRow } from "@/features/content/application/articles";

/** Public DTOs use ISO strings: cached results are JSON-serialised. */
const url = (key: string | null | undefined) => (key ? publicMediaUrl(key) : null);
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
/** PostgreSQL `date` → YYYY-MM-DD (pg returns local-midnight Date objects; never use String(date)). */
const dateOnly = (d: unknown): string | null => {
  if (!d) return null;
  if (d instanceof Date) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return String(d).slice(0, 10);
};

export type PublicService = {
  id: string; slug: string; name: string; category: string; summary: string; description: unknown; imageUrl: string | null;
  priceMinor: number; currency: string; priceDisplay: string; durationMinutes: number; bookingMode: "instant" | "enquiry" | "none";
  locationType: string; featured: boolean; cancellationPolicy: string; capacity: number;
};

export const getPublicServices = unstable_cache(
  withMedia(async (): Promise<PublicService[]> => {
    const rows = await db.query<Record<string, unknown> & { storage_key: string | null }>(
      `select s.*, m.storage_key from services s left join media_assets m on m.id = s.image_media_id
        where s.is_active order by s.featured desc, s.sort_order, s.name`,
    );
    return rows.map((s) => ({
      id: s.id as string, slug: s.slug as string, name: s.name as string, category: s.category as string, summary: s.summary as string,
      description: s.description, imageUrl: url(s.storage_key), priceMinor: s.price_minor as number, currency: s.currency as string,
      priceDisplay: s.price_display as string, durationMinutes: s.duration_minutes as number, bookingMode: s.booking_mode as PublicService["bookingMode"],
      locationType: s.location_type as string, featured: s.featured as boolean, cancellationPolicy: s.cancellation_policy as string, capacity: s.capacity as number,
    }));
  }),
  ["public-services:v1"],
  { tags: [TAGS.services], revalidate: 3600 },
);

export type PublicEvent = {
  id: string; slug: string; title: string; subtitle: string; kind: string; format: "online" | "in_person" | "hybrid"; summary: string;
  description: unknown; coverUrl: string | null; flyerUrl: string | null; venueName: string; venueAddress: string; timezone: string;
  startsAt: string; endsAt: string; capacity: number | null; registrationOpensAt: string | null; registrationClosesAt: string | null;
  waitlistEnabled: boolean; registrationUrl: string | null; speakers: { name: string; title?: string; bio?: string; photoUrl?: string }[];
  agenda: { time: string; title: string; description?: string }[]; faqs: { q: string; a: string }[];
  status: "draft" | "published" | "cancelled" | "completed"; cancellationReason: string | null; seo: Record<string, string>;
  certificateEnabled: boolean; fromPriceMinor: number | null; currency: string; sessions: { title: string; startsAt: string; endsAt: string }[];
};

function mapEvent(e: Record<string, unknown>): PublicEvent {
  return {
    id: e.id as string, slug: e.slug as string, title: e.title as string, subtitle: e.subtitle as string, kind: e.kind as string,
    format: e.format as PublicEvent["format"], summary: e.summary as string, description: e.description,
    coverUrl: url(e.cover_key as string | null), flyerUrl: url(e.flyer_key as string | null), venueName: e.venue_name as string,
    venueAddress: e.venue_address as string, timezone: e.timezone as string, startsAt: iso(e.starts_at as Date)!, endsAt: iso(e.ends_at as Date)!,
    capacity: e.capacity as number | null, registrationOpensAt: iso(e.registration_opens_at as Date | null), registrationClosesAt: iso(e.registration_closes_at as Date | null),
    waitlistEnabled: e.waitlist_enabled as boolean, registrationUrl: (e.registration_url as string | null) ?? null, speakers: (e.speakers as PublicEvent["speakers"]) ?? [], agenda: (e.agenda as PublicEvent["agenda"]) ?? [],
    faqs: (e.faqs as PublicEvent["faqs"]) ?? [], status: e.status as PublicEvent["status"], cancellationReason: e.cancellation_reason as string | null,
    seo: (e.seo as Record<string, string>) ?? {}, certificateEnabled: e.certificate_enabled as boolean,
    fromPriceMinor: (e.from_price as number | null) ?? null, currency: (e.currency as string) ?? "GHS",
    sessions: ((e.sessions as { title: string; starts_at: string; ends_at: string }[] | null) ?? []).map((s) => ({ title: s.title, startsAt: iso(s.starts_at)!, endsAt: iso(s.ends_at)! })),
  };
}

const EVENT_SELECT = `select ${PUBLIC_EVENT_COLUMNS}, cm.storage_key as cover_key, fm.storage_key as flyer_key,
   (select min(price_minor) from ticket_types t where t.event_id = e.id and t.visibility = 'public') as from_price,
   (select currency from ticket_types t where t.event_id = e.id order by position limit 1) as currency,
   (select json_agg(json_build_object('title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at) from event_sessions s where s.event_id = e.id) as sessions
   from events e left join media_assets cm on cm.id = e.cover_media_id left join media_assets fm on fm.id = e.flyer_media_id`;

export const getPublicEvents = unstable_cache(
  withMedia(async (): Promise<PublicEvent[]> =>
    (await db.query(`${EVENT_SELECT} where e.status in ('published','completed','cancelled') and e.published_at is not null order by e.starts_at`)).map(mapEvent)),
  ["public-events:v1"],
  { tags: [TAGS.events], revalidate: 300 },
);

export const getPublicEvent = unstable_cache(
  withMedia(async (slug: string): Promise<PublicEvent | null> => {
    const row = await db.one(`${EVENT_SELECT} where e.slug = $1 and e.status in ('published','completed','cancelled') and e.published_at is not null`, [slug]);
    return row ? mapEvent(row) : null;
  }),
  ["public-event:v1"],
  { tags: [TAGS.events], revalidate: 300 },
);

/** Uncached draft preview for staff (the caller must check permissions). */
export async function getEventPreview(slug: string): Promise<PublicEvent | null> {
  await primeMedia();
  const row = await db.one(`${EVENT_SELECT} where e.slug = $1`, [slug]);
  return row ? mapEvent(row) : null;
}

export type PublicCourse = {
  id: string; slug: string; title: string; subtitle: string; summary: string; description: unknown; coverUrl: string | null;
  category: string; level: string; priceMinor: number; currency: string; outcomes: string[]; certificateEnabled: boolean;
  lessonCount: number; totalSeconds: number; modules: { title: string; lessons: { title: string; kind: string; isPreview: boolean; durationSeconds: number | null }[] }[];
  seo: Record<string, string>; visibility: "public" | "unlisted";
};

export const getPublicCourses = unstable_cache(
  withMedia(async (): Promise<PublicCourse[]> => {
    const rows = await db.query<Record<string, unknown>>(
      `select c.*, m.storage_key as cover_key,
        (select count(*)::int from lessons l where l.course_id = c.id) as lesson_count,
        (select coalesce(sum(duration_seconds),0)::int from lessons l where l.course_id = c.id) as total_seconds,
        (select json_agg(json_build_object('title', cm.title, 'lessons',
            (select coalesce(json_agg(json_build_object('title', l.title, 'kind', l.kind, 'isPreview', l.is_preview, 'durationSeconds', l.duration_seconds) order by l.position), '[]')
               from lessons l where l.module_id = cm.id)) order by cm.position)
           from course_modules cm where cm.course_id = c.id) as modules
       from courses c left join media_assets m on m.id = c.cover_media_id
       where c.status = 'published' and c.visibility <> 'private' order by c.published_at desc nulls last`,
    );
    return rows.map((c) => ({
      id: c.id as string, slug: c.slug as string, title: c.title as string, subtitle: c.subtitle as string, summary: c.summary as string,
      description: c.description, coverUrl: url(c.cover_key as string | null), category: c.category as string, level: c.level as string,
      priceMinor: c.price_minor as number, currency: c.currency as string, outcomes: (c.outcomes as string[]) ?? [],
      certificateEnabled: c.certificate_enabled as boolean, lessonCount: c.lesson_count as number, totalSeconds: c.total_seconds as number,
      modules: (c.modules as PublicCourse["modules"]) ?? [], seo: (c.seo as Record<string, string>) ?? {},
      visibility: c.visibility as PublicCourse["visibility"],
    }));
  }),
  ["public-courses:v1"],
  { tags: [TAGS.courses], revalidate: 3600 },
);

export type PublicProduct = {
  id: string; slug: string; title: string; kind: string; summary: string; description: unknown; coverUrl: string | null;
  priceMinor: number; currency: string; isLeadMagnet: boolean; seo: Record<string, string>;
};

export const getPublicProducts = unstable_cache(
  withMedia(async (): Promise<PublicProduct[]> => {
    const rows = await db.query<Record<string, unknown>>(
      `select p.*, m.storage_key as cover_key from products p left join media_assets m on m.id = p.cover_media_id
        where p.status = 'published' order by p.published_at desc nulls last`,
    );
    return rows.map((p) => ({
      id: p.id as string, slug: p.slug as string, title: p.title as string, kind: p.kind as string, summary: p.summary as string,
      description: p.description, coverUrl: url(p.cover_key as string | null), priceMinor: p.price_minor as number,
      currency: p.currency as string, isLeadMagnet: p.is_lead_magnet as boolean, seo: (p.seo as Record<string, string>) ?? {},
    }));
  }),
  ["public-products:v1"],
  { tags: [TAGS.products], revalidate: 3600 },
);

export type PublicTestimonial = { id: string; authorName: string; authorTitle: string; company: string; quote: string; rating: number | null; photoUrl: string | null; featured: boolean };

export const getPublicTestimonials = unstable_cache(
  withMedia(async (): Promise<PublicTestimonial[]> => {
    // Only approved testimonials with recorded consent (also enforced by a CHECK constraint).
    const rows = await db.query<Record<string, unknown>>(
      `select t.*, m.storage_key from testimonials t left join media_assets m on m.id = t.photo_media_id
        where t.status = 'approved' and t.consent_confirmed order by t.featured desc, t.approved_at desc nulls last`,
    );
    return rows.map((t) => ({
      id: t.id as string, authorName: t.author_name as string, authorTitle: t.author_title as string, company: t.company as string,
      quote: t.quote as string, rating: t.rating as number | null, photoUrl: url(t.storage_key as string | null), featured: t.featured as boolean,
    }));
  }),
  ["public-testimonials:v1"],
  { tags: [TAGS.proof], revalidate: 3600 },
);

export type PublicArticle = {
  id: string; slug: string; title: string; excerpt: string; body: unknown; coverUrl: string | null; videoUrl: string | null;
  categoryName: string | null; categorySlug: string | null; categoryId: string | null; authorName: string; featured: boolean;
  publishedAt: string; readingMinutes: number; tags: string[]; seo: { title?: string; description?: string };
};

const mapArticle = (a: ArticleRow): PublicArticle => ({
  id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, body: a.body, coverUrl: url(a.cover_key), videoUrl: a.video_url,
  categoryName: a.category_name ?? null, categorySlug: a.category_slug ?? null, categoryId: a.category_id, authorName: a.author_name,
  featured: a.featured, publishedAt: iso(a.published_at)!, readingMinutes: a.reading_minutes, tags: a.tags ?? [], seo: a.seo ?? {},
});

export const getPublicArticles = unstable_cache(
  withMedia(async (opts: { q?: string; category?: string; tag?: string; page?: number; featuredOnly?: boolean; limit?: number }) =>
    (await publishedArticles(opts)).map(mapArticle)),
  ["public-articles:v1"],
  { tags: [TAGS.articles], revalidate: 600 },
);

export const getPublicArticle = unstable_cache(
  withMedia(async (slug: string) => {
    const a = await publishedArticle(slug);
    if (!a) return null;
    const related = (await relatedArticles(a.id, a.category_id)).map(mapArticle);
    return { article: mapArticle(a), related };
  }),
  ["public-article:v1"],
  { tags: [TAGS.articles], revalidate: 600 },
);

export const getPublishedPage = unstable_cache(
  withMedia(async (slug: string) => {
    const p = await publishedPage(slug);
    return p ? { ...p, published_at: iso(p.published_at) } : null;
  }),
  ["published-page:v1"],
  { tags: [TAGS.pages], revalidate: 3600 },
);

export type PublicCaseStudy = { slug: string; title: string; clientName: string; summary: string; challenge: unknown; approach: unknown; outcome: unknown; coverUrl: string | null; publishedAt: string | null };

export const getPublicCaseStudies = unstable_cache(
  withMedia(async (): Promise<PublicCaseStudy[]> => {
    const rows = await db.query<Record<string, unknown>>(
      `select c.*, m.storage_key from case_studies c left join media_assets m on m.id = c.cover_media_id
        where c.status = 'published' and c.consent_confirmed order by c.published_at desc`,
    );
    return rows.map((c) => ({
      slug: c.slug as string, title: c.title as string, clientName: c.client_name as string, summary: c.summary as string,
      challenge: c.challenge, approach: c.approach, outcome: c.outcome, coverUrl: url(c.storage_key as string | null), publishedAt: iso(c.published_at as Date | null),
    }));
  }),
  ["public-case-studies:v1"],
  { tags: [TAGS.proof], revalidate: 3600 },
);

export type PublicAppearance = { id: string; kind: string; title: string; outlet: string; url: string | null; appearedOn: string | null; description: string; imageUrl: string | null; featured: boolean };

export const getPublicAppearances = unstable_cache(
  withMedia(async (): Promise<PublicAppearance[]> => {
    const rows = await db.query<Record<string, unknown>>(
      `select a.*, m.storage_key from media_appearances a left join media_assets m on m.id = a.image_media_id where a.published order by a.appeared_on desc nulls last`,
    );
    return rows.map((a) => ({
      id: a.id as string, kind: a.kind as string, title: a.title as string, outlet: a.outlet as string, url: a.url as string | null,
      appearedOn: dateOnly(a.appeared_on), description: a.description as string,
      imageUrl: url(a.storage_key as string | null), featured: a.featured as boolean,
    }));
  }),
  ["public-appearances:v1"],
  { tags: [TAGS.proof], revalidate: 3600 },
);

export const getSpeakingTopics = unstable_cache(
  withMedia(async () => db.query<{ id: string; title: string; description: string; audience: string; formats: string[] }>(
    "select id, title, description, audience, formats from speaking_topics where active order by position, title",
  )),
  ["speaking-topics:v1"],
  { tags: [TAGS.proof], revalidate: 3600 },
);
