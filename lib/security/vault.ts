import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Credential vault: AES-256-GCM with versioned master keys kept OUTSIDE the
 * database (CREDENTIALS_MASTER_KEYS). Every encryption uses a fresh 96-bit
 * nonce; the context string (e.g. the provider name) is bound as additional
 * authenticated data, so ciphertext can't be swapped between rows.
 *
 * Format: v<version>.<nonce>.<tag>.<ciphertext>  (base64url parts)
 */
export class VaultNotConfiguredError extends Error {
  constructor() {
    super("CREDENTIALS_MASTER_KEYS is not configured on the server. Integrations cannot store credentials until an operator sets it.");
  }
}

type Keyring = { active: number; keys: Map<number, Buffer> };
let keyring: Keyring | null | undefined;

export function parseKeyring(spec: string | undefined): Keyring | null {
  if (!spec) return null;
  const keys = new Map<number, Buffer>();
  let active: number | null = null;
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+):(.+)$/.exec(part);
    if (!m) throw new Error("CREDENTIALS_MASTER_KEYS entries must look like `1:base64key`");
    const version = Number(m[1]);
    const key = Buffer.from(m[2], "base64");
    if (key.length !== 32) throw new Error(`Master key v${version} must be 32 bytes (base64 of 32 random bytes)`);
    if (keys.has(version)) throw new Error(`Duplicate master key version v${version}`);
    keys.set(version, key);
    active ??= version; // first entry encrypts new data
  }
  if (active === null) return null;
  return { active, keys };
}

function ring(): Keyring {
  // Read directly (not via the cached env()) so key rotation can be exercised in tests.
  if (keyring === undefined) keyring = parseKeyring(process.env.CREDENTIALS_MASTER_KEYS?.trim() || undefined);
  if (!keyring) throw new VaultNotConfiguredError();
  return keyring;
}

export function vaultAvailable(): boolean {
  try {
    ring();
    return true;
  } catch {
    return false;
  }
}

export function activeKeyVersion(): number {
  return ring().active;
}

export function sealSecret(plaintext: string, context: string): { ciphertext: string; keyVersion: number } {
  const r = ring();
  const key = r.keys.get(r.active)!;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: [`v${r.active}`, nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join("."),
    keyVersion: r.active,
  };
}

export function openSecret(sealed: string, context: string): string {
  const [v, nonce, tag, ct] = sealed.split(".");
  const version = Number(v?.slice(1));
  const key = ring().keys.get(version);
  if (!key) throw new Error(`Master key v${version} is not available on this server (needed to decrypt stored credentials).`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Test seam: reset the parsed keyring after changing the environment. */
export function resetVaultForTests() {
  keyring = undefined;
}

/** Display-safe hint: keeps a recognisable prefix (e.g. sk_test_) and the last 4 characters. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  const prefix = /^(sk|pk)_(test|live)_/.exec(value)?.[0] ?? "";
  return `${prefix}••••${value.slice(-4)}`;
}
