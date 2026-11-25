import "server-only";
import { UserError } from "@/lib/errors";
import sharp from "sharp";
import { db } from "@/lib/database/pool";
import { storage, type Visibility } from "@/lib/storage";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { audit } from "@/lib/audit";
import { maxBytesFor, safeFilename, sniffFileType } from "../domain/file-types";

export type MediaAsset = {
  id: string;
  storage_key: string;
  visibility: Visibility;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  category: string;
  variants: { width: number; key: string }[];
  created_at: Date;
};

export class UploadError extends UserError {}

const VARIANT_WIDTHS = [480, 960, 1600];

export async function uploadMedia(input: {
  bytes: Buffer;
  filename: string;
  visibility: Visibility;
  altText?: string;
  category?: string;
  actorId: string;
}): Promise<{ asset: MediaAsset; duplicate: boolean }> {
  const type = sniffFileType(input.bytes, input.filename);
  if (!type) throw new UploadError("This file type isn't supported. Upload JPG, PNG, WebP, AVIF, GIF, PDF, Office documents, MP3/M4A or MP4.");
  if (input.bytes.length > maxBytesFor(type.kind)) {
    throw new UploadError(`File is too large. The limit for ${type.kind} files is ${Math.round(maxBytesFor(type.kind) / 1048576)} MB.`);
  }

  let body = input.bytes;
  let width: number | null = null;
  let height: number | null = null;
  let mime = type.mime;
  let ext = type.ext;

  if (type.kind === "image") {
    // Re-encode: strips EXIF/GPS metadata, normalises orientation, defeats polyglots.
    const img = sharp(input.bytes, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
    const meta = await img.metadata();
    if (type.mime !== "image/gif") {
      body = await img.clone().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      mime = "image/webp";
      ext = "webp";
      const m = await sharp(body).metadata();
      width = m.width ?? null;
      height = m.height ?? null;
    } else {
      width = meta.width ?? null;
      height = meta.height ?? null;
    }
  }

  const hash = sha256(input.bytes);
  const existing = await db.one<MediaAsset>(
    "select * from media_assets where sha256 = $1 and visibility = $2 and deleted_at is null",
    [hash, input.visibility],
  );
  if (existing) return { asset: existing, duplicate: true };

  const stamp = new Date().toISOString().slice(0, 7).replace("-", "/");
  const base = `${stamp}/${randomToken(9)}-${safeFilename(input.filename).replace(/\.[^.]+$/, "")}`.toLowerCase();
  const key = `${base}.${ext}`;
  const store = storage();
  await store.put(key, body, mime, input.visibility);

  const variants: { width: number; key: string }[] = [];
  if (type.kind === "image" && mime === "image/webp" && width) {
    for (const w of VARIANT_WIDTHS.filter((w) => w < width!)) {
      const vKey = `${base}-${w}.webp`;
      const vBody = await sharp(body).resize({ width: w }).webp({ quality: 80 }).toBuffer();
      await store.put(vKey, vBody, "image/webp", input.visibility);
      variants.push({ width: w, key: vKey });
    }
  }

  const asset = await db.one<MediaAsset>(
    `insert into media_assets (storage_key, visibility, filename, mime_type, size_bytes, width, height, sha256, alt_text, category, variants, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [key, input.visibility, safeFilename(input.filename), mime, body.length, width, height, hash,
     (input.altText ?? "").slice(0, 500), input.category ?? "general", JSON.stringify(variants), input.actorId],
  );
  await audit({ actorId: input.actorId, action: "media.upload", entityType: "media", entityId: asset!.id, data: { filename: input.filename, visibility: input.visibility } });
  return { asset: asset!, duplicate: false };
}

export function mediaUrl(asset: Pick<MediaAsset, "storage_key" | "visibility">): string | null {
  return asset.visibility === "public" ? storage().publicUrl(asset.storage_key) : null;
}

/** Where a media asset is still referenced. Deletion is blocked while any exist. */
export async function mediaReferences(id: string): Promise<string[]> {
  const rows = await db.query<{ ref: string }>(
    `select 'Article: ' || title as ref from articles where cover_media_id = $1 and status <> 'archived'
     union all select 'Service: ' || name from services where image_media_id = $1 and is_active
     union all select 'Event: ' || title from events where (cover_media_id = $1 or flyer_media_id = $1) and status <> 'cancelled'
     union all select 'Course: ' || title from courses where cover_media_id = $1 and status <> 'archived'
     union all select 'Product: ' || title from products where (cover_media_id = $1 or file_media_id = $1) and status <> 'archived'
     union all select 'Lesson: ' || title from lessons where media_id = $1
     union all select 'Lesson resource: ' || title from lesson_resources where media_id = $1
     union all select 'Event resource: ' || title from event_resources where media_id = $1
     union all select 'Testimonial: ' || author_name from testimonials where photo_media_id = $1 and status = 'approved'
     union all select 'Page: ' || title from pages
        where (published_content::text like '%' || $1::text || '%' or draft_content::text like '%' || $1::text || '%')`,
    [id],
  );
  const asset = await db.one<{ storage_key: string }>("select storage_key from media_assets where id = $1", [id]);
  if (asset) {
    const byUrl = await db.query<{ ref: string }>(
      `select 'Page: ' || title as ref from pages
        where published_content::text like '%' || $1 || '%' or draft_content::text like '%' || $1 || '%'
       union all select 'Settings: ' || key from settings where value::text like '%' || $1 || '%'`,
      [asset.storage_key],
    );
    rows.push(...byUrl);
  }
  return [...new Set(rows.map((r) => r.ref))];
}

export async function deleteMedia(id: string, actorId: string): Promise<{ ok: true } | { ok: false; references: string[] }> {
  const refs = await mediaReferences(id);
  if (refs.length) return { ok: false, references: refs };
  const asset = await db.one<MediaAsset>("update media_assets set deleted_at = now() where id = $1 and deleted_at is null returning *", [id]);
  if (asset) {
    const store = storage();
    await store.remove(asset.storage_key, asset.visibility);
    for (const v of asset.variants ?? []) await store.remove(v.key, asset.visibility);
    await audit({ actorId, action: "media.delete", entityType: "media", entityId: id, data: { filename: asset.filename } });
  }
  return { ok: true };
}

export async function listMedia(opts: { q?: string; visibility?: Visibility; category?: string; page?: number; kind?: "image" | "file" }) {
  const page = Math.max(1, opts.page ?? 1);
  const params: unknown[] = [];
  const where = ["deleted_at is null"];
  if (opts.q) {
    params.push(opts.q);
    where.push(`to_tsvector('simple', filename || ' ' || alt_text) @@ plainto_tsquery('simple', $${params.length})`);
  }
  if (opts.visibility) { params.push(opts.visibility); where.push(`visibility = $${params.length}`); }
  if (opts.category) { params.push(opts.category); where.push(`category = $${params.length}`); }
  if (opts.kind === "image") where.push(`mime_type like 'image/%'`);
  if (opts.kind === "file") where.push(`mime_type not like 'image/%'`);
  params.push(48, (page - 1) * 48);
  return db.query<MediaAsset>(
    `select * from media_assets where ${where.join(" and ")} order by created_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}
