/**
 * One-off move of locally stored media to Cloudflare R2, then switch the site to R2.
 * Run inside the worker container (it mounts the media volume). Credentials are read
 * as JSON from stdin — never from arguments, environment or logs:
 *
 *   cat r2.json | docker compose exec -T worker npx tsx --tsconfig tsconfig.worker.json scripts/migrate-media-to-r2.ts [--dry-run]
 *   r2.json: {"accountId","accessKeyId","secretAccessKey","publicBucket","privateBucket","publicBaseUrl"}
 *
 * Order: save config (encrypted vault) → connection test → copy every file → verify each
 * object (size + MD5/ETag) → enable R2. Local files are NOT deleted; existing /media/… links
 * keep working because /media serves from the active driver.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { closePool } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { saveIntegration, setIntegrationEnabled } from "@/lib/integrations/store";
import { runConnectionTest } from "@/features/integrations/application/connection-tests";

const TYPES: Record<string, string> = {
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".txt": "text/plain", ".ics": "text/calendar",
};

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const c = JSON.parse(raw) as Record<string, string>;
  for (const k of ["accountId", "accessKeyId", "secretAccessKey", "publicBucket", "privateBucket", "publicBaseUrl"]) if (!c[k]) throw new Error(`${k} missing`);

  const s3 = new S3Client({ region: "auto", endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
  const root = resolve(env().LOCAL_STORAGE_DIR);
  let copied = 0, skipped = 0, bytes = 0;
  for (const vis of ["public", "private"] as const) {
    const bucket = vis === "public" ? c.publicBucket : c.privateBucket;
    for (const file of await walk(join(root, vis))) {
      const key = relative(join(root, vis), file).split("\\").join("/");
      const body = await readFile(file);
      const md5 = createHash("md5").update(body).digest("hex");
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
      if (head?.ETag?.replace(/"/g, "") === md5 && head.ContentLength === body.length) { skipped++; continue; }
      if (dry) { console.log(`would copy ${vis}/${key}`); continue; }
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: body, ContentType: TYPES[extname(key).toLowerCase()] ?? "application/octet-stream",
        CacheControl: vis === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      }));
      const v = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (v.ContentLength !== body.length || v.ETag?.replace(/"/g, "") !== md5) throw new Error(`verification failed for ${vis}/${key}`);
      copied++; bytes += body.length;
    }
  }
  console.log(`media: ${copied} copied and verified (${(bytes / 1048576).toFixed(1)} MB), ${skipped} already present and identical`);
  if (dry) return;

  // Vault-encrypted, exactly as if entered in Studio → Integrations. Actor recorded as the server shell (null user).
  const system = null as unknown as string;
  await saveIntegration("r2", { values: { accountId: c.accountId, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, publicBucket: c.publicBucket, privateBucket: c.privateBucket, publicBaseUrl: c.publicBaseUrl } }, system);
  // Records its own result, so Studio shows "Connected" only after a real write/read/delete in both buckets.
  const result = await runConnectionTest("r2", system).then((m) => ({ ok: true, m }), (e: Error) => ({ ok: false, m: e.message }));
  if (!result.ok) throw new Error(`R2 connection test failed: ${result.m} — R2 left disabled, site still uses local storage`);
  await setIntegrationEnabled("r2", true, system);
  console.log(`R2 connection test passed (${result.m}); R2 storage enabled`);
}

main().catch((e) => { console.error("migrate-media-to-r2 failed:", e.message); process.exitCode = 1; }).finally(() => closePool());
