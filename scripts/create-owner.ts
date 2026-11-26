/**
 * Secure first-admin provisioning and account recovery (server shell only —
 * deliberately not available through the web interface).
 *
 *   pnpm create-owner --email you@example.com --name "Full Name" [--role owner|admin]
 *       Creates or promotes the account and prints a single-use set-password
 *       link valid for 60 minutes. No password ever appears in shell history,
 *       environment variables or logs.
 *
 *   pnpm create-owner --email you@example.com --reset-mfa
 *       Recovery for a staff member who lost their authenticator AND recovery
 *       codes: disables MFA and signs out all sessions. They must re-enrol.
 */
import { db, closePool } from "@/lib/database/pool";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { env } from "@/lib/config/env";

const STAFF_ROLES = ["owner", "admin", "content_manager", "booking_manager", "finance_manager"];

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const email = get("email")?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email is required");

  if (args.includes("--reset-mfa")) {
    const u = await db.one<{ id: string }>(
      "update users set mfa_enabled_at = null, mfa_secret_encrypted = null, mfa_recovery_codes = '[]'::jsonb, mfa_last_step = null where email = $1 returning id",
      [email],
    );
    if (!u) throw new Error("No account with that email.");
    await db.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [u.id]);
    await db.query("insert into audit_logs (actor_label, action, entity_type, entity_id) values ('server-shell', 'auth.mfa_reset', 'user', $1)", [u.id]);
    console.log(`MFA reset for ${email}. All sessions signed out; they must set up MFA again at next sign-in.`);
    return;
  }

  const role = get("role") ?? "owner";
  if (!STAFF_ROLES.includes(role)) throw new Error(`--role must be one of ${STAFF_ROLES.join(", ")}`);
  const name = get("name") ?? "";
  const user = await db.one<{ id: string }>(
    `insert into users (email, full_name, role, email_verified_at) values ($1, $2, $3, now())
     on conflict (email) do update set role = excluded.role, full_name = coalesce(nullif(excluded.full_name, ''), users.full_name),
       email_verified_at = coalesce(users.email_verified_at, now())
     returning id`,
    [email, name, role],
  );
  const token = randomToken(32);
  await db.query(
    `insert into auth_tokens (user_id, email, purpose, token_hash, expires_at) values ($1, $2, 'reset_password', $3, now() + interval '60 minutes')`,
    [user!.id, email, hashToken(token)],
  );
  await db.query("insert into audit_logs (actor_label, action, entity_type, entity_id, data) values ('server-shell', 'auth.provision_staff', 'user', $1, $2)", [user!.id, JSON.stringify({ role })]);
  console.log(`Account ready: ${email} (${role}).`);
  console.log("Open this single-use link within 60 minutes to set the password (do not share it):");
  console.log(`${env().APP_URL}/reset-password?token=${token}`);
  console.log("After signing in, Studio will ask you to set up two-factor authentication.");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => closePool());
