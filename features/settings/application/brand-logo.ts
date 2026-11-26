import "server-only";
import sharp from "sharp";
import { db } from "@/lib/database/pool";
import { storage } from "@/lib/storage";
import { loadSetting } from "./settings";

/**
 * The brand logo as PNG bytes for PDFs. Only logos stored in our own media
 * library are used (never fetched from arbitrary URLs — no SSRF).
 */
export async function brandLogoPng(): Promise<{ png: Buffer; width: number; height: number } | null> {
  const logo = (await loadSetting("brand")).logoUrl;
  if (!logo) return null;
  const marker = logo.indexOf("/media/");
  const key = marker >= 0 ? logo.slice(marker + "/media/".length) : null;
  const asset = key
    ? await db.one<{ storage_key: string }>("select storage_key from media_assets where storage_key = $1 and visibility = 'public' and deleted_at is null", [key])
    : await db.one<{ storage_key: string }>(
        "select storage_key from media_assets where visibility = 'public' and deleted_at is null and $1 like '%' || storage_key limit 1", [logo]);
  if (!asset) return null;
  const bytes = await (await storage()).get(asset.storage_key, "public");
  if (!bytes) return null;
  try {
    const png = await sharp(bytes).resize({ height: 120, withoutEnlargement: true }).png().toBuffer();
    const m = await sharp(png).metadata();
    return { png, width: m.width ?? 0, height: m.height ?? 0 };
  } catch {
    return null;
  }
}
