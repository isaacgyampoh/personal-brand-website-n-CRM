import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/config/env";
import { getIntegration } from "@/lib/integrations/store";
import { signValue } from "@/lib/security/crypto";

export type Visibility = "public" | "private";

/** Object storage port. Keys are opaque, server-generated paths. */
export interface ObjectStorage {
  readonly driver: "r2" | "local";
  put(key: string, body: Buffer, contentType: string, visibility: Visibility): Promise<void>;
  get(key: string, visibility: Visibility): Promise<Buffer | null>;
  remove(key: string, visibility: Visibility): Promise<void>;
  publicUrl(key: string): string;
  /** Short-lived URL for a private object. */
  signedUrl(key: string, opts: { expiresInSeconds: number; downloadName?: string; contentType?: string }): Promise<string>;
}

function assertKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,300}$/i.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

// ---------------------------------------------------------------------------
// Cloudflare R2 (S3-compatible). Status: implemented, UNVERIFIED until R2
// credentials are supplied.
// ---------------------------------------------------------------------------
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; publicBucket: string; privateBucket: string; publicBaseUrl: string };

export function createR2Storage(c: R2Config): ObjectStorage {
  if (!/^[a-f0-9]{32}$/.test(c.accountId)) throw new Error("R2 account ID must be 32 hexadecimal characters.");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  const bucket = (v: Visibility) => (v === "public" ? c.publicBucket : c.privateBucket);
  return {
    driver: "r2",
    async put(key, body, contentType, visibility) {
      assertKey(key);
      await client.send(new PutObjectCommand({
        Bucket: bucket(visibility), Key: key, Body: body, ContentType: contentType,
        CacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      }));
    },
    async get(key, visibility) {
      assertKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket(visibility), Key: key }));
        return Buffer.from(await res.Body!.transformToByteArray());
      } catch {
        return null;
      }
    },
    async remove(key, visibility) {
      assertKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket(visibility), Key: key }));
    },
    publicUrl(key) {
      return `${c.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    },
    async signedUrl(key, { expiresInSeconds, downloadName, contentType }) {
      assertKey(key);
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: c.privateBucket,
          Key: key,
          ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/[^\w.\- ]/g, "_")}"` : undefined,
          ResponseContentType: contentType,
        }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Local filesystem — development/testing; in production only with
// ALLOW_LOCAL_STORAGE_IN_PRODUCTION (staging before R2 is configured).
// Private objects are served via /api/files/<signed token>.
// ---------------------------------------------------------------------------
function local(): ObjectStorage {
  const root = resolve(env().LOCAL_STORAGE_DIR);
  const path = (key: string, v: Visibility) => {
    assertKey(key);
    const p = resolve(join(root, v, key));
    if (!p.startsWith(root)) throw new Error("Invalid storage key");
    return p;
  };
  return {
    driver: "local",
    async put(key, body, _ct, v) {
      const p = path(key, v);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key, v) {
      try {
        return await readFile(path(key, v));
      } catch {
        return null;
      }
    },
    async remove(key, v) {
      await rm(path(key, v), { force: true });
    },
    publicUrl(key) {
      return `/media/${key}`;
    },
    async signedUrl(key, { expiresInSeconds, downloadName }) {
      const token = signValue(JSON.stringify({ k: key, n: downloadName ?? null }), Math.floor(Date.now() / 1000) + expiresInSeconds);
      return `/api/files/${token}`;
    },
  };
}

let instance: { key: string; store: ObjectStorage } | undefined;
let mediaBase = "/media";

/**
 * Public URL for a public object, synchronously. Uses the R2 public base URL
 * once storage() has resolved it in this process; before that it falls back to
 * /media/<key>, which serves the object from whichever driver is active.
 */
export function publicMediaUrl(key: string): string {
  return `${mediaBase.replace(/\/$/, "")}/${key}`;
}

/** Wraps a loader so public media URLs use the current storage configuration. */
export function withMedia<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    await storage().catch(() => null);
    return fn(...args);
  };
}

/**
 * Active storage: Cloudflare R2 when enabled in the Integration Centre,
 * otherwise local disk (development, or staging that explicitly opts in).
 */
export async function storage(): Promise<ObjectStorage> {
  const r2 = await getIntegration("r2");
  const key = r2.usable ? `r2:${JSON.stringify(r2.values)}` : "local";
  if (instance?.key === key) return instance.store;
  if (!r2.usable && env().NODE_ENV === "production" && !env().ALLOW_LOCAL_STORAGE_IN_PRODUCTION) {
    throw new Error("File storage is not configured. Enable Cloudflare R2 in Settings → Integrations.");
  }
  const v = r2.values;
  const store = r2.usable
    ? createR2Storage({ accountId: v.accountId, accessKeyId: v.accessKeyId, secretAccessKey: v.secretAccessKey, publicBucket: v.publicBucket, privateBucket: v.privateBucket, publicBaseUrl: v.publicBaseUrl })
    : local();
  instance = { key, store };
  mediaBase = r2.usable && v.publicBaseUrl ? v.publicBaseUrl : "/media";
  return store;
}
