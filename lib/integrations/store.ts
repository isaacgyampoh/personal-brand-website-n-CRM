import "server-only";
import { createHash } from "node:crypto";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { env } from "@/lib/config/env";
import { UserError } from "@/lib/errors";
import { activeKeyVersion, maskSecret, openSecret, sealSecret, vaultAvailable } from "@/lib/security/vault";
import { assertPublicHttpsUrl } from "@/lib/security/network";
import {
  computeStatus, integrationDef, INTEGRATIONS, storedKey, type FieldDef, type IntegrationProvider, type IntegrationStatus,
} from "./definitions";

export class IntegrationError extends UserError {}

type Row = {
  provider: IntegrationProvider; enabled: boolean; mode: "test" | "live"; settings: Record<string, unknown>;
  secrets_encrypted: string | null; key_version: number | null; secret_hints: Record<string, string>; verified_hash: string | null;
  last_tested_at: Date | null; last_success_at: Date | null; last_failure_at: Date | null; last_error: string | null; updated_at: Date;
};

/** Resolved configuration for use by adapters (server only — contains secrets). */
export type ResolvedIntegration = {
  provider: IntegrationProvider;
  enabled: boolean;
  mode: "test" | "live";
  status: IntegrationStatus;
  /** Values for the active mode, keyed by field name (per-mode prefixes removed). */
  values: Record<string, string>;
  /** Raw stored values incl. both modes (for tests that need them). */
  all: Record<string, string>;
  /** Enabled and complete: safe to use. */
  usable: boolean;
  /** Current configuration passed a connection test. */
  verified: boolean;
  lastSuccessAt: Date | null;
};

/** Public view (no secrets) for the Integration Centre UI. */
export type IntegrationView = {
  provider: IntegrationProvider; enabled: boolean; mode: "test" | "live"; status: IntegrationStatus;
  settings: Record<string, unknown>; secretHints: Record<string, string>; lastTestedAt: string | null;
  lastSuccessAt: string | null; lastFailureAt: string | null; lastError: string | null; keyVersion: number | null; updatedAt: string | null;
};

const CACHE_MS = 30_000;
const cache = new Map<IntegrationProvider, { at: number; value: ResolvedIntegration }>();
export function invalidateIntegrationCache(provider?: IntegrationProvider) {
  if (provider) cache.delete(provider); else cache.clear();
}

const toStr = (v: unknown): string => (Array.isArray(v) ? v.join(",") : v === undefined || v === null ? "" : String(v));

function defaultsFor(provider: IntegrationProvider): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of integrationDef(provider).fields) {
    if (f.default === undefined) continue;
    for (const m of f.perMode ? (["test", "live"] as const) : (["test"] as const)) out[storedKey(f, m)] = toStr(f.default);
  }
  return out;
}

function hashConfig(mode: string, values: Record<string, string>): string {
  const sorted = Object.keys(values).sort().map((k) => [k, values[k]]);
  return createHash("sha256").update(JSON.stringify([mode, sorted])).digest("hex");
}

function decryptSecrets(row: Row): Record<string, string> {
  if (!row.secrets_encrypted) return {};
  return JSON.parse(openSecret(row.secrets_encrypted, `integration:${row.provider}`)) as Record<string, string>;
}

function resolve(provider: IntegrationProvider, row: Row | null): ResolvedIntegration {
  const def = integrationDef(provider);
  const mode = row?.mode ?? "test";
  const stored: Record<string, string> = {};
  for (const [k, v] of Object.entries(row?.settings ?? {})) stored[k] = toStr(v);
  let secrets: Record<string, string> = {};
  if (row?.secrets_encrypted) {
    try {
      secrets = decryptSecrets(row);
    } catch (e) {
      console.error(`[integrations] cannot decrypt ${provider} credentials:`, (e as Error).message);
    }
  }
  const all = { ...defaultsFor(provider), ...stored, ...secrets };
  const relevant = Object.fromEntries(def.fields.map((f) => [storedKey(f, mode), all[storedKey(f, mode)] ?? ""]));
  const present = new Set(Object.entries(relevant).filter(([, v]) => v !== "").map(([k]) => k));
  const hasAny = Boolean(row && (Object.keys(row.settings ?? {}).length || row.secrets_encrypted));
  const currentHash = hashConfig(mode, relevant);
  const status = computeStatus({
    def, mode, enabled: row?.enabled ?? false, present, hasAny, currentHash, verifiedHash: row?.verified_hash ?? null,
    lastFailureAt: row?.last_failure_at ?? null, lastSuccessAt: row?.last_success_at ?? null,
  });
  const values = Object.fromEntries(def.fields.map((f) => [f.name, relevant[storedKey(f, mode)] ?? ""]));
  const complete = def.fields.every((f) => !f.required || present.has(storedKey(f, mode)));
  return {
    provider, enabled: row?.enabled ?? false, mode, status, values, all, usable: Boolean(row?.enabled) && complete,
    verified: status === "connected", lastSuccessAt: row?.last_success_at ?? null,
  };
}

async function loadRow(provider: IntegrationProvider): Promise<Row | null> {
  return db.one<Row>("select * from integration_configs where provider = $1", [provider]);
}

/** Cached, decrypted configuration for adapters. Never send the result to a browser. */
export async function getIntegration(provider: IntegrationProvider): Promise<ResolvedIntegration> {
  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = resolve(provider, await loadRow(provider));
  cache.set(provider, { at: Date.now(), value });
  return value;
}

export async function listIntegrationViews(): Promise<IntegrationView[]> {
  const rows = await db.query<Row>("select * from integration_configs");
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return INTEGRATIONS.map((d) => {
    const row = byProvider.get(d.provider) ?? null;
    const r = resolve(d.provider, row);
    return {
      provider: d.provider, enabled: r.enabled, mode: r.mode, status: r.status,
      settings: { ...defaultsFor(d.provider), ...(row?.settings ?? {}) }, secretHints: row?.secret_hints ?? {},
      lastTestedAt: row?.last_tested_at?.toISOString() ?? null, lastSuccessAt: row?.last_success_at?.toISOString() ?? null,
      lastFailureAt: row?.last_failure_at?.toISOString() ?? null, lastError: row?.last_error ?? null, keyVersion: row?.key_version ?? null,
      updatedAt: row?.updated_at?.toISOString() ?? null,
    };
  });
}

async function validateField(f: FieldDef, value: string): Promise<string> {
  const v = value.trim();
  if (!v) return v;
  if (v.length > 4000) throw new IntegrationError(`${f.label} is too long.`);
  if (f.pattern && !new RegExp(f.pattern).test(v)) throw new IntegrationError(`${f.label} doesn't look right.`);
  if (f.type === "number" && !/^\d+$/.test(v)) throw new IntegrationError(`${f.label} must be a whole number.`);
  if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new IntegrationError(`${f.label} must be an email address.`);
  if (f.type === "select" && f.options && !f.options.some((o) => o.value === v)) throw new IntegrationError(`Choose a valid ${f.label}.`);
  if (f.type === "multiselect" && f.options && v.split(",").some((x) => !f.options!.some((o) => o.value === x))) throw new IntegrationError(`Choose valid ${f.label}.`);
  if (f.type === "url") await assertPublicHttpsUrl(v);
  return v;
}

/**
 * Saves configuration. Secret fields are write-only: an empty value keeps the
 * stored secret; `clear` removes named secrets. Any change invalidates the
 * previous verification. Audit records which fields changed, never values.
 */
export async function saveIntegration(
  provider: IntegrationProvider,
  input: { values: Record<string, string>; clear?: string[]; mode?: "test" | "live" },
  actorId: string,
): Promise<void> {
  if (!vaultAvailable()) throw new IntegrationError("The server's credential encryption key (CREDENTIALS_MASTER_KEYS) is not set. Ask your server administrator.");
  const def = integrationDef(provider);
  const allowedKeys = new Map<string, FieldDef>();
  for (const f of def.fields) for (const m of f.perMode ? (["test", "live"] as const) : (["test"] as const)) allowedKeys.set(storedKey(f, m), f);

  await tx(async (t) => {
    const row = await t.one<Row>("select * from integration_configs where provider = $1 for update", [provider]);
    const settings: Record<string, string> = Object.fromEntries(Object.entries(row?.settings ?? {}).map(([k, v]) => [k, toStr(v)]));
    const secrets = row ? decryptSecrets(row) : {};
    const hints = { ...(row?.secret_hints ?? {}) };
    const changed: string[] = [];

    for (const [key, raw] of Object.entries(input.values)) {
      const f = allowedKeys.get(key);
      if (!f) continue;
      if (f.perMode && f.pattern && raw.trim()) {
        // keys must match their mode (sk_test_ in test fields, sk_live_ in live fields)
        const mode = key.split(".")[0];
        if (/^(sk|pk)_(test|live)_/.test(raw.trim()) && !raw.trim().includes(`_${mode}_`)) throw new IntegrationError(`${f.label} for ${mode} mode must be a ${mode} key.`);
      }
      const value = await validateField(f, raw);
      if (f.type === "secret") {
        if (!value) continue; // keep existing secret
        if (secrets[key] !== value) changed.push(key);
        secrets[key] = value;
        hints[key] = maskSecret(value);
      } else if ((settings[key] ?? "") !== value) {
        changed.push(key);
        settings[key] = value;
      }
    }
    for (const key of input.clear ?? []) {
      if (allowedKeys.get(key)?.type === "secret" && key in secrets) {
        delete secrets[key];
        delete hints[key];
        changed.push(key);
      }
    }
    let mode = row?.mode ?? "test";
    if (input.mode && input.mode !== mode) {
      if (!def.modes) throw new IntegrationError("This integration has no test/live modes.");
      if (input.mode === "live" && !env().PAYMENTS_LIVE_APPROVED) {
        throw new IntegrationError("Live payments are locked until the server operator approves go-live (PAYMENTS_LIVE_APPROVED). Your live keys can still be saved.");
      }
      mode = input.mode;
      changed.push("mode");
    }
    const sealed = Object.keys(secrets).length ? sealSecret(JSON.stringify(secrets), `integration:${provider}`) : null;
    await t.query(
      `insert into integration_configs (provider, mode, settings, secrets_encrypted, key_version, secret_hints, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (provider) do update set mode = excluded.mode, settings = excluded.settings, secrets_encrypted = excluded.secrets_encrypted,
         key_version = excluded.key_version, secret_hints = excluded.secret_hints, updated_by = excluded.updated_by`,
      [provider, mode, JSON.stringify(settings), sealed?.ciphertext ?? null, sealed?.keyVersion ?? null, JSON.stringify(hints), actorId],
    );
    await audit({ actorId, action: "integration.configure", entityType: "integration", entityId: provider, data: { changedFields: changed } }, t);
  });
  invalidateIntegrationCache(provider);
}

export async function setIntegrationEnabled(provider: IntegrationProvider, enabled: boolean, actorId: string) {
  const r = resolve(provider, await loadRow(provider));
  if (enabled && r.status === "incomplete") throw new IntegrationError("Complete the required fields before enabling.");
  if (enabled && r.status === "not_configured") throw new IntegrationError("Configure this integration first.");
  if (enabled && r.mode === "live" && ["paystack", "hubtel"].includes(provider) && !env().PAYMENTS_LIVE_APPROVED) {
    throw new IntegrationError("Live payments are locked until the server operator approves go-live.");
  }
  if (enabled && provider === "hubtel" && !env().PAYMENTS_LIVE_APPROVED) {
    throw new IntegrationError("Hubtel has no test mode, so enabling it takes real payments. It is locked until the server operator approves live payments.");
  }
  await db.query(
    `insert into integration_configs (provider, enabled, updated_by) values ($1,$2,$3)
     on conflict (provider) do update set enabled = excluded.enabled, updated_by = excluded.updated_by`,
    [provider, enabled, actorId],
  );
  await audit({ actorId, action: enabled ? "integration.enable" : "integration.disable", entityType: "integration", entityId: provider });
  invalidateIntegrationCache(provider);
}

/** Records a connection-test outcome against the exact configuration that was tested. */
export async function recordTestResult(provider: IntegrationProvider, ok: boolean, error: string | null, actorId: string | null) {
  const row = await loadRow(provider);
  const r = resolve(provider, row);
  const def = integrationDef(provider);
  const relevant = Object.fromEntries(def.fields.map((f) => [storedKey(f, r.mode), r.all[storedKey(f, r.mode)] ?? ""]));
  const hash = hashConfig(r.mode, relevant);
  await db.query(
    ok
      ? `update integration_configs set verified_hash = $2, last_tested_at = now(), last_success_at = now(), last_error = null where provider = $1`
      : `update integration_configs set verified_hash = null, last_tested_at = now(), last_failure_at = now(), last_error = $2 where provider = $1`,
    ok ? [provider, hash] : [provider, (error ?? "Unknown error").slice(0, 500)],
  );
  await audit({ actorId, actorLabel: actorId ? undefined : "system", action: ok ? "integration.test_ok" : "integration.test_failed", entityType: "integration", entityId: provider, data: ok ? {} : { error: (error ?? "").slice(0, 200) } });
  invalidateIntegrationCache(provider);
}

/** Stores an additional secret produced by an OAuth flow (e.g. Google refresh token). */
export async function storeOAuthSecret(provider: IntegrationProvider, key: string, value: string, actorId: string | null) {
  await tx(async (t) => {
    const row = await t.one<Row>("select * from integration_configs where provider = $1 for update", [provider]);
    if (!row) throw new IntegrationError("Save the integration settings first.");
    const secrets = decryptSecrets(row);
    if (value) secrets[key] = value; else delete secrets[key];
    const sealed = sealSecret(JSON.stringify(secrets), `integration:${provider}`);
    const hints = { ...row.secret_hints };
    if (value) hints[key] = "connected"; else delete hints[key];
    await t.query("update integration_configs set secrets_encrypted = $2, key_version = $3, secret_hints = $4 where provider = $1",
      [provider, sealed.ciphertext, sealed.keyVersion, JSON.stringify(hints)]);
    await audit({ actorId, action: value ? "integration.oauth_connected" : "integration.oauth_disconnected", entityType: "integration", entityId: provider }, t);
  });
  invalidateIntegrationCache(provider);
}

/** Re-encrypts every stored credential with the active master key version. */
export async function rotateCredentialEncryption(actorId: string | null): Promise<number> {
  const target = activeKeyVersion();
  const rows = await db.query<Row>("select * from integration_configs where secrets_encrypted is not null and key_version is distinct from $1", [target]);
  for (const row of rows) {
    const plain = openSecret(row.secrets_encrypted!, `integration:${row.provider}`);
    const sealed = sealSecret(plain, `integration:${row.provider}`);
    await db.query("update integration_configs set secrets_encrypted = $2, key_version = $3 where provider = $1 and key_version is not distinct from $4",
      [row.provider, sealed.ciphertext, sealed.keyVersion, row.key_version]);
  }
  await audit({ actorId, actorLabel: actorId ? undefined : "operator", action: "integration.rotate_keys", entityType: "integration", data: { rows: rows.length, toVersion: target } });
  invalidateIntegrationCache();
  return rows.length;
}

/** Integration statuses for dashboards (no secrets). */
export async function integrationStatuses(): Promise<Record<IntegrationProvider, IntegrationStatus>> {
  const views = await listIntegrationViews();
  return Object.fromEntries(views.map((v) => [v.provider, v.status])) as Record<IntegrationProvider, IntegrationStatus>;
}
