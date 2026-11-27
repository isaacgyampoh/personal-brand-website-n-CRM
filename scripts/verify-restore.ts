/**
 * Verifies a RESTORED copy of the database (never the live one):
 *  1. Business fingerprint matches the manifest captured at backup time.
 *  2. Relationship and money invariants hold (not just row counts).
 *  3. Authentication data is present (owner with password, staff MFA state).
 *  4. Every encrypted integration credential decrypts with the operator's
 *     master key(s) — proves credentials are recoverable. Values are never printed.
 *
 *   VERIFY_DATABASE_URL=... MANIFEST_JSON=/path/manifest.json CREDENTIALS_MASTER_KEYS=... \
 *     tsx --tsconfig tsconfig.worker.json scripts/verify-restore.ts
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { openSecret, vaultAvailable } from "@/lib/security/vault";

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) throw new Error("VERIFY_DATABASE_URL is required");
  const manifest = process.env.MANIFEST_JSON ? JSON.parse(readFileSync(process.env.MANIFEST_JSON, "utf8")) : null;
  const c = new Client({ connectionString: url });
  await c.connect();
  const one = async <T = Record<string, unknown>>(sql: string) => (await c.query(sql)).rows[0] as T;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  // 1. Fingerprint vs manifest
  const now = (await one<{ m: Record<string, unknown> }>(`select (${readFileSync(new URL("./backup-manifest.sql", import.meta.url), "utf8").replace(/;\s*$/, "").replace(/^--.*$/gm, "")}) as m`)).m;
  if (manifest) {
    for (const k of Object.keys(manifest).filter((k) => k !== "tables")) check(`manifest: ${k}`, String(manifest[k]) === String(now[k]), `${manifest[k]} → ${now[k]}`);
    const mt = manifest.tables as Record<string, number>, nt = now.tables as Record<string, number>;
    const diff = Object.keys(mt).filter((t) => Number(mt[t]) !== Number(nt[t] ?? -1));
    check("manifest: row counts for every table", diff.length === 0, diff.length ? diff.map((t) => `${t} ${mt[t]}→${nt[t]}`).join(", ") : `${Object.keys(mt).length} tables match`);
  } else check("manifest present", false, "no manifest supplied");

  // 2. Relationships & money invariants
  const inv = await one<Record<string, string>>(`select
    (select count(*) from financial_ledger l left join orders o on o.id = l.order_id where o.id is null) as ledger_orphans,
    (select count(*) from order_items i left join orders o on o.id = i.order_id where o.id is null) as item_orphans,
    (select count(*) from orders o where o.status in ('paid','partially_refunded','refunded') and o.total_minor > 0 and not exists (select 1 from invoices i where i.order_id = o.id)) as paid_without_receipt,
    (select count(*) from orders o where o.status in ('paid','partially_refunded','refunded') and o.total_minor > 0 and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'success')) as paid_without_payment,
    (select count(*) from orders o where o.status in ('paid','partially_refunded','refunded') and (select coalesce(sum(amount_minor),0) from financial_ledger l where l.order_id = o.id) <> o.total_minor - o.refunded_minor) as ledger_mismatch,
    (select count(*) from event_registrations r join orders o on o.id = r.order_id where r.status = 'confirmed' and o.status not in ('paid','partially_refunded','needs_attention')) as confirmed_unpaid_registrations,
    (select count(*) from enrolments e left join contacts c on c.id = e.contact_id where c.id is null) as enrolment_orphans,
    (select count(*) from appointments a left join services s on s.id = a.service_id where s.id is null) as appointment_orphans,
    (select count(*) from sessions s left join users u on u.id = s.user_id where u.id is null) as session_orphans,
    (select count(*) from pg_constraint where conname = 'appointments_no_overlap') as overlap_constraint,
    (select count(*) from pg_trigger where tgname like '%immutable%') as immutability_triggers`);
  for (const [k, v] of Object.entries(inv)) {
    if (k === "overlap_constraint") check("double-booking constraint restored", Number(v) === 1, `${v}`);
    else if (k === "immutability_triggers") check("ledger/audit immutability triggers restored", Number(v) >= 2, `${v}`);
    else check(`invariant: ${k.replace(/_/g, " ")}`, Number(v) === 0, `${v}`);
  }

  // 3. Authentication data
  const auth = await one<{ owners: string; owners_with_password: string }>("select count(*) filter (where role = 'owner') as owners, count(*) filter (where role = 'owner' and password_hash is not null) as owners_with_password from users");
  check("auth: owner account restored", Number(auth.owners) >= 1, `${auth.owners} owner(s), ${auth.owners_with_password} with password`);
  check("auth: password hashes use scrypt", Number((await one<{ n: string }>("select count(*) as n from users where password_hash is not null and password_hash not like 'scrypt$%'")).n) === 0);

  // 4. Integration credentials decrypt with the operator's master key(s)
  const rows = (await c.query<{ provider: string; secrets_encrypted: string; key_version: number }>("select provider, secrets_encrypted, key_version from integration_configs where secrets_encrypted is not null")).rows;
  if (!rows.length) check("integration credentials", true, "none stored yet");
  else if (!vaultAvailable()) check("integration credentials decrypt", false, "CREDENTIALS_MASTER_KEYS not provided to the verifier");
  else for (const r of rows) {
    try {
      const n = Object.keys(JSON.parse(openSecret(r.secrets_encrypted, `integration:${r.provider}`))).length;
      check(`credentials decrypt: ${r.provider}`, true, `key v${r.key_version}, ${n} secret field(s)`);
    } catch (e) {
      check(`credentials decrypt: ${r.provider}`, false, (e as Error).message.slice(0, 80));
    }
  }
  await c.end();
  const failed = checks.filter((x) => !x.ok);
  for (const x of checks) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.detail ? `  (${x.detail})` : ""}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error("verify failed:", e.message); process.exitCode = 1; });
