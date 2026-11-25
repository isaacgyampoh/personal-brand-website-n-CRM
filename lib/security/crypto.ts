import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

/** URL-safe random token with `bytes` of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Human-friendly reference like BK-7F3K9Q2M (no ambiguous characters). */
export function humanReference(prefix: string, length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${prefix}-${out}`;
}

/** Keyed hash for storing tokens (session, reset, manage links). */
export function hashToken(token: string): string {
  return createHmac("sha256", env().APP_SECRET).update(token).digest("hex");
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(`enc:${env().APP_SECRET}`).digest();
}

/** AES-256-GCM for integration credentials / MFA secrets at rest. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * Privacy-preserving visitor/IP hash. Salted with the secret and the current
 * UTC day so identifiers cannot be correlated across days or reversed.
 */
export function anonymousHash(value: string, scope = new Date().toISOString().slice(0, 10)): string {
  return createHmac("sha256", env().APP_SECRET).update(`${scope}:${value}`).digest("base64url").slice(0, 22);
}

/** Signed, expiring value (e.g. download links, join tokens). */
export function signValue(value: string, expiresAtEpochSeconds: number): string {
  const body = `${value}.${expiresAtEpochSeconds}`;
  const sig = createHmac("sha256", env().APP_SECRET).update(body).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${sig}`;
}

export function verifySignedValue(token: string): string | null {
  const [bodyB64, sig] = token.split(".");
  if (!bodyB64 || !sig) return null;
  const body = Buffer.from(bodyB64, "base64url").toString("utf8");
  const expected = createHmac("sha256", env().APP_SECRET).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  const dot = body.lastIndexOf(".");
  const exp = Number(body.slice(dot + 1));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return body.slice(0, dot);
}
