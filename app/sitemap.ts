import type { MetadataRoute } from "next";
import { db } from "@/lib/database/pool";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const statics = ["", "/about", "/services", "/book", "/masterclasses", "/academy", "/shop", "/insights", "/speaking", "/case-studies", "/media", "/testimonials", "/contact"];
  const [pages, articles, events, courses, products, services, cases] = await Promise.all([
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from pages where published_content is not null and status in ('published','scheduled') and slug not in ('home','about','speaking') and coalesce((seo->>'noindex')::boolean, false) = false"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from articles where status = 'published'"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from events where status in ('published','completed') and published_at is not null"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from courses where status = 'published' and visibility = 'public'"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from products where status = 'published'"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from services where is_active"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from case_studies where status = 'published' and consent_confirmed"),
  ]);
  const map = (prefix: string, rows: { slug: string; updated_at: Date }[]) => rows.map((r) => ({ url: `${base}${prefix}/${r.slug}`, lastModified: r.updated_at }));
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...map("", pages), ...map("/insights", articles), ...map("/masterclasses", events), ...map("/academy", courses),
    ...map("/shop", products), ...map("/services", services), ...map("/case-studies", cases),
  ];
}
