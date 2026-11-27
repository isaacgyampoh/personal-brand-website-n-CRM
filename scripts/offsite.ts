/**
 * Off-site backup copy to a dedicated Cloudflare R2 bucket (S3 API), with
 * verification and retention. Uses backup-only credentials from the server
 * environment — separate from the client's media R2 credentials.
 *
 *   tsx scripts/offsite.ts upload <file...>     upload + verify size/checksum metadata
 *   tsx scripts/offsite.ts prune <days>         delete off-site backups older than <days>
 *   tsx scripts/offsite.ts mirror <days>        copy new media objects (BACKUP_MEDIA_BUCKETS) into media/<bucket>/;
 *                                               copies of deleted media are kept <days> days, then removed
 *   tsx scripts/offsite.ts list
 */
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };
const bucket = need("BACKUP_R2_BUCKET");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("BACKUP_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: need("BACKUP_R2_ACCESS_KEY_ID"), secretAccessKey: need("BACKUP_R2_SECRET_ACCESS_KEY") },
});
const prefix = "db/";

async function upload(files: string[]) {
  for (const f of files) {
    const key = prefix + basename(f);
    const size = statSync(f).size;
    const sha = f.endsWith(".dump.enc") ? readFileSync(`${f}.sha256`, "utf8").trim() : undefined;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(f), ContentLength: size, Metadata: sha ? { sha256: sha } : undefined }));
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.ContentLength !== size) throw new Error(`size mismatch for ${key}: local ${size}, remote ${head.ContentLength}`);
    if (sha && head.Metadata?.sha256 !== sha) throw new Error(`checksum metadata mismatch for ${key}`);
    console.log(`uploaded ${key} (${size} bytes) — verified`);
  }
}

async function list(b = bucket, p = prefix) {
  const out: { key: string; size: number; at: Date; etag?: string }[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: b, Prefix: p, ContinuationToken: token }));
    for (const o of r.Contents ?? []) out.push({ key: o.Key!, size: o.Size ?? 0, at: o.LastModified!, etag: o.ETag });
    token = r.NextContinuationToken;
  } while (token);
  return out;
}

async function prune(days: number) {
  const cutoff = Date.now() - days * 86400_000;
  const all = await list();
  const dumps = all.filter((o) => o.key.endsWith(".dump.enc"));
  // Never delete the newest 7 backups, whatever their age.
  const keep = new Set(dumps.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 7).map((o) => o.key));
  let n = 0;
  for (const o of all) {
    const base = o.key.replace(/(\.sha256|\.manifest\.enc)$/, "");
    if (o.at.getTime() < cutoff && !keep.has(base)) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key })); n++; }
  }
  console.log(`pruned ${n} object(s) older than ${days} days; ${dumps.length} backup(s) were present`);
}

/** Server-side copy of the client's media buckets into the private backup bucket (same account, no download). */
async function mirror(days: number) {
  const sources = (process.env.BACKUP_MEDIA_BUCKETS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!sources.length) { console.log("mirror: BACKUP_MEDIA_BUCKETS not set — skipped"); return; }
  const cutoff = Date.now() - days * 86400_000;
  for (const src of sources) {
    const dest = `media/${src}/`;
    const [have, copies] = await Promise.all([list(src, ""), list(bucket, dest)]);
    const copied = new Map(copies.map((o) => [o.key.slice(dest.length), o]));
    let added = 0, removed = 0;
    for (const o of have) {
      const c = copied.get(o.key);
      if (c && c.size === o.size && c.etag === o.etag) continue;
      await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: dest + o.key, CopySource: `${src}/${encodeURIComponent(o.key).replace(/%2F/g, "/")}` }));
      added++;
    }
    const live = new Set(have.map((o) => o.key));
    for (const [k, c] of copied) if (!live.has(k) && c.at.getTime() < cutoff) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: dest + k })); removed++; }
    console.log(`mirror ${src}: ${have.length} object(s), ${added} copied, ${removed} expired cop(ies) of deleted media removed`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
(cmd === "upload" ? upload(args) : cmd === "prune" ? prune(Number(args[0] ?? 35)) : cmd === "mirror" ? mirror(Number(args[0] ?? 35)) : list().then((l) => l.forEach((o) => console.log(o.at.toISOString(), o.size, o.key))))
  .catch((e) => { console.error("offsite failed:", e.message); process.exitCode = 1; });
