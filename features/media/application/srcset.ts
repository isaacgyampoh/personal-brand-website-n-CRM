import "server-only";
import { db } from "@/lib/database/pool";
import { publicMediaUrl } from "@/lib/storage";

/** Storage key from a public media URL ("/media/<key>" or "<R2 base>/<key>"). */
function keyOf(url: string): string | null {
  const i = url.indexOf("/media/");
  if (i >= 0) return url.slice(i + 7);
  const m = /^https:\/\/[^/]+\/(.+)$/.exec(url);
  return m ? m[1] : null;
}

/**
 * Builds `srcset` strings for uploaded images from the variants the upload
 * pipeline actually created (480/960/1600 px), so phones download a small
 * image. Only existing files are referenced; unknown URLs get no srcset.
 */
export async function srcSetsFor(urls: string[]): Promise<Record<string, string>> {
  const byKey = new Map<string, string>();
  for (const u of new Set(urls.filter(Boolean))) { const k = keyOf(u); if (k) byKey.set(k, u); }
  if (!byKey.size) return {};
  const rows = await db.query<{ storage_key: string; width: number | null; variants: { width: number; key: string }[] }>(
    "select storage_key, width, variants from media_assets where storage_key = any($1) and deleted_at is null and visibility = 'public'",
    [[...byKey.keys()]],
  );
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.variants?.length || !r.width) continue;
    out[byKey.get(r.storage_key)!] = [...r.variants.map((v) => `${publicMediaUrl(v.key)} ${v.width}w`), `${publicMediaUrl(r.storage_key)} ${r.width}w`].join(", ");
  }
  return out;
}
