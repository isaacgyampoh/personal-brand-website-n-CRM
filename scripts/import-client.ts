/**
 * Imports a client's real content from a PRIVATE manifest (kept outside Git)
 * using the application's own services: media upload pipeline (EXIF stripped,
 * WebP, responsive variants), validated settings, validated page drafts and
 * publishing with revision history. All client-specific text lives in the
 * manifest; this script contains none. Safe to re-run (settings are merged,
 * records upserted, duplicate photos de-duplicated).
 *
 *   tsx --tsconfig tsconfig.worker.json scripts/import-client.ts /path/to/manifest.json
 *
 * Page templates may use tokens: {{headshot}} {{stage}} {{teaching}} {{alt:<photo>}}
 * {{portraitAlt}} {{shortBio}} {{stats}} {{logos}} {{gallery}} {{gallery:N}} {{appearances:N}}.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db, closePool } from "@/lib/database/pool";
import { publicMediaUrl } from "@/lib/storage";
import { loadSettings, saveSetting } from "@/features/settings/application/settings";
import type { SettingKey } from "@/features/settings/domain/schemas";
import { cropMedia, setFocalPoint, uploadMedia } from "@/features/media/application/media";
import { publishPage, saveDraft } from "@/features/website/application/pages";
import { docFromText } from "@/features/content/domain/rich-text";
import { requestRevalidation } from "@/features/automation/application/scheduled";

type Photo = [file: string, alt: string, caption?: string];
type Manifest = {
  photosDir: string;
  brand: Record<string, string>; profile: Record<string, string>; theme: Record<string, string>; seo: Record<string, unknown>;
  navigation?: Record<string, unknown>; links?: Record<string, unknown>; features?: Record<string, boolean>;
  stats: { value: string; label: string; note: string }[];
  photos: { headshot: string; gallery: Photo[]; library: Photo[] } & Record<string, unknown>;
  photoAlts?: Record<string, string>;
  logos: [file: string, name: string][];
  services: { slug: string; name: string; summary: string; description: string; duration: number; category: string; featured: boolean }[];
  speakingTopics: { title: string; description: string; audience: string; formats: string[] }[];
  appearances: { title: string; outlet: string; date: string; description: string }[];
  pages: Record<string, unknown[]>;
};

const m: Manifest = JSON.parse(readFileSync(process.argv[2] ?? ".data/client/manifest.json", "utf8"));

async function main() {
  const owner = await db.one<{ id: string }>("select id from users where role = 'owner' order by created_at limit 1");
  if (!owner) throw new Error("Create the owner account first (scripts/create-owner.ts).");
  const actor = owner.id;
  const up = async (file: string, alt: string, category: string) =>
    (await uploadMedia({ bytes: readFileSync(join(m.photosDir, file)), filename: file.replace(/^WhatsApp Image /, "photo-"), visibility: "public", altText: alt, category, actorId: actor })).asset;
  const url = (a: { storage_key: string }) => publicMediaUrl(a.storage_key);

  // ---- Media ----------------------------------------------------------------
  const headshot = await up(m.photos.headshot, m.brand.portraitAlt ?? "", "portraits");
  await setFocalPoint(headshot.id, 0.5, 0.3, actor);
  const share = await cropMedia(headshot.id, "1.91:1", actor);
  const square = await cropMedia(headshot.id, "1:1", actor);
  const named: Record<string, string> = { headshot: url(headshot) };
  for (const [key, file] of Object.entries(m.photos)) {
    if (typeof file === "string" && key !== "headshot") named[key] = url(await up(file, m.photoAlts?.[key] ?? "", "speaking"));
  }
  const gallery: { url: string; alt: string; caption: string }[] = [];
  for (const [f, alt, caption] of m.photos.gallery) gallery.push({ url: url(await up(f, alt, "speaking")), alt, caption: caption ?? "" });
  for (const [f, alt] of m.photos.library) await up(f, alt, "events");
  const logos: { name: string; logoUrl: string; href: string }[] = [];
  for (const [f, name] of m.logos) logos.push({ name, logoUrl: url(await up(f, `${name} logo`, "partners")), href: "" });

  // ---- Settings (merged into what is already there) -------------------------
  const s = await loadSettings();
  const merge = async (key: SettingKey, patch: Record<string, unknown> | undefined) => {
    if (patch) await saveSetting(key, { ...(s[key] as object), ...patch }, actor);
  };
  await merge("brand", { ...m.brand, portraitUrl: url(headshot), faviconUrl: url(square) });
  await merge("profile", m.profile);
  await merge("theme", m.theme);
  await merge("seo", { ...m.seo, ogImageUrl: url(share) });
  await merge("navigation", m.navigation);
  await merge("links", m.links);
  await merge("features", m.features);

  // ---- Services: enquiry-only until prices are confirmed (never an invented price)
  for (const [i, sv] of m.services.entries()) {
    await db.query(
      `insert into services (slug, name, category, summary, description, price_minor, price_display, duration_minutes, booking_mode, featured, sort_order, is_active, location_type)
       values ($1,$2,$3,$4,$5,0,'Price on enquiry',$6,'enquiry',$7,$8,true,'online')
       on conflict (slug) do update set name = excluded.name, category = excluded.category, summary = excluded.summary, description = excluded.description,
         duration_minutes = excluded.duration_minutes, featured = excluded.featured, sort_order = excluded.sort_order`,
      [sv.slug, sv.name, sv.category, sv.summary, JSON.stringify(docFromText(sv.description)), sv.duration, sv.featured, i],
    );
  }

  // ---- Speaking topics & engagements -----------------------------------------
  for (const [i, t] of m.speakingTopics.entries()) {
    const ex = await db.one<{ id: string }>("select id from speaking_topics where title = $1", [t.title]);
    if (ex) await db.query("update speaking_topics set description=$2, audience=$3, formats=$4, position=$5, active=true where id=$1", [ex.id, t.description, t.audience, t.formats, i]);
    else await db.query("insert into speaking_topics (title, description, audience, formats, position) values ($1,$2,$3,$4,$5)", [t.title, t.description, t.audience, t.formats, i]);
  }
  for (const a of m.appearances) {
    const ex = await db.one<{ id: string }>("select id from media_appearances where title = $1 and appeared_on = $2", [a.title, a.date]);
    if (!ex) await db.query("insert into media_appearances (kind, title, outlet, appeared_on, description, published) values ('speaking_engagement',$1,$2,$3,$4,true)", [a.title, a.outlet, a.date, a.description]);
  }

  // ---- Pages (templates from the manifest) ----------------------------------
  const fill = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    if (typeof v !== "string" || !v.startsWith("{{")) return v;
    const [name, arg] = v.slice(2, -2).split(":");
    if (name === "stats") return m.stats;
    if (name === "logos") return logos;
    if (name === "gallery") return arg ? gallery.slice(0, Number(arg)) : gallery;
    if (name === "appearances") return m.appearances.slice(0, Number(arg ?? 6)).map((a) => ({ title: a.title.replace(/^[^—]+—\s*/, ""), detail: a.outlet }));
    if (name === "alt") return m.photoAlts?.[arg] ?? "";
    if (name === "portraitAlt") return m.brand.portraitAlt ?? "";
    if (name === "shortBio") return m.brand.shortBio ?? "";
    return named[name] ?? "";
  };
  for (const [slug, content] of Object.entries(m.pages)) {
    const page = await db.one<{ id: string }>("select id from pages where slug = $1", [slug]);
    if (!page) throw new Error(`Page ${slug} is missing (run migrations with seed).`);
    await saveDraft(page.id, { root: { props: {} }, content: fill(content) }, {}, actor);
    await publishPage(page.id, actor, "Client content import");
    await db.query("update pages set is_demo = false where id = $1", [page.id]);
  }
  await requestRevalidation(["settings", "pages", "services", "proof"]).catch((e) => console.warn("Cache refresh failed — restart the web app:", (e as Error).message));
  console.log(`Imported ${3 + Object.keys(named).length - 1 + m.photos.gallery.length + m.photos.library.length} photos, ${logos.length} logos, ${m.services.length} services, ${m.speakingTopics.length} topics, ${m.appearances.length} engagements, ${Object.keys(m.pages).length} pages.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closePool());
