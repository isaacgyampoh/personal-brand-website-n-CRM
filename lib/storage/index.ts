import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, integrations } from "@/lib/config/env";
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
function r2(): ObjectStorage {
  const e = env();
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID!, secretAccessKey: e.R2_SECRET_ACCESS_KEY! },
  });
  const bucket = (v: Visibility) => (v === "public" ? e.R2_PUBLIC_BUCKET! : e.R2_PRIVATE_BUCKET!);
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
      return `${e.R2_PUBLIC_BASE_URL!.replace(/\/$/, "")}/${key}`;
    },
    async signedUrl(key, { expiresInSeconds, downloadName, contentType }) {
      assertKey(key);
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: e.R2_PRIVATE_BUCKET!,
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
// Local filesystem — development/testing only (blocked in production by env()).
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

let instance: ObjectStorage | undefined;
export function storage(): ObjectStorage {
  if (!instance) instance = integrations().r2 ? r2() : local();
  return instance;
}
