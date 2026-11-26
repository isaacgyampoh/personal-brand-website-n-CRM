import "server-only";
import { UserError } from "@/lib/errors";
import sharp from "sharp";
import { db } from "@/lib/database/pool";
import { publicMediaUrl, storage, type Visibility } from "@/lib/storage";
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
  focal_x?: string;
  focal_y?: string;
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
  const store = await storage();
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
  return asset.visibility === "public" ? publicMediaUrl(asset.storage_key) : null;
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
    const store = await storage();
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

// ---------------------------------------------------------------------------
// Focal point & cropping
// ---------------------------------------------------------------------------
export const CROP_ASPECTS = { "16:9": 16 / 9, "1:1": 1, "4:5": 4 / 5, "1.91:1": 1.91, "3:4": 3 / 4 } as const;
export type CropAspect = keyof typeof CROP_ASPECTS;

/** Largest rectangle of the given aspect that fits the image, centred on the focal point and clamped to the edges. Pure. */
export function cropRect(width: number, height: number, aspect: number, focalX: number, focalY: number) {
  let w = width;
  let h = Math.round(width / aspect);
  if (h > height) { h = height; w = Math.round(height * aspect); }
  const left = Math.min(Math.max(Math.round(focalX * width - w / 2), 0), width - w);
  const top = Math.min(Math.max(Math.round(focalY * height - h / 2), 0), height - h);
  return { left, top, width: w, height: h };
}

export async function setFocalPoint(id: string, x: number, y: number, actorId: string) {
  const fx = Math.min(Math.max(x, 0), 1);
  const fy = Math.min(Math.max(y, 0), 1);
  await db.query("update media_assets set focal_x = $2, focal_y = $3 where id = $1 and mime_type like 'image/%'", [id, fx.toFixed(4), fy.toFixed(4)]);
  await audit({ actorId, action: "media.focal", entityType: "media", entityId: id });
}

/** Creates a new cropped copy (the original is never modified), with its own responsive variants. */
export async function cropMedia(id: string, aspect: CropAspect, actorId: string): Promise<MediaAsset> {
  const src = await db.one<MediaAsset>("select * from media_assets where id = $1 and deleted_at is null", [id]);
  if (!src || !src.mime_type.startsWith("image/") || src.mime_type === "image/gif") throw new UploadError("Only still images can be cropped.");
  const bytes = await (await storage()).get(src.storage_key, src.visibility);
  if (!bytes) throw new UploadError("The original file could not be read from storage.");
  const meta = await sharp(bytes).metadata();
  const rect = cropRect(meta.width ?? 0, meta.height ?? 0, CROP_ASPECTS[aspect], Number(src.focal_x), Number(src.focal_y));
  const cropped = await sharp(bytes).extract(rect).webp({ quality: 88 }).toBuffer();
  const name = `${src.filename.replace(/\.[^.]+$/, "")}-${aspect.replace(":", "x")}.webp`;
  const { asset } = await uploadMedia({ bytes: cropped, filename: name, visibility: src.visibility, altText: src.alt_text, category: src.category, actorId });
  await db.query("update media_assets set derived_from = $2 where id = $1", [asset.id, src.id]);
  return asset;
}

/** Storage used by stored originals (variants add roughly a third for images). */
export async function storageUsage() {
  const [totals, byCategory] = await Promise.all([
    db.one<{ files: number; bytes: number; public_bytes: number; private_bytes: number; images: number; videos: number }>(
      `select count(*)::int as files, coalesce(sum(size_bytes),0)::bigint as bytes,
              coalesce(sum(size_bytes) filter (where visibility = 'public'),0)::bigint as public_bytes,
              coalesce(sum(size_bytes) filter (where visibility = 'private'),0)::bigint as private_bytes,
              count(*) filter (where mime_type like 'image/%')::int as images, count(*) filter (where mime_type like 'video/%')::int as videos
         from media_assets where deleted_at is null`),
    db.query<{ category: string; files: number; bytes: number }>(
      "select category, count(*)::int as files, coalesce(sum(size_bytes),0)::bigint as bytes from media_assets where deleted_at is null group by 1 order by 3 desc limit 10"),
  ]);
  return { ...totals!, bytes: Number(totals!.bytes), public_bytes: Number(totals!.public_bytes), private_bytes: Number(totals!.private_bytes), byCategory: byCategory.map((c) => ({ ...c, bytes: Number(c.bytes) })) };
}
