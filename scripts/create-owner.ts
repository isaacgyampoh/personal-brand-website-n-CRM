/**
 * Creates (or promotes) the business owner account.
 *   pnpm create-owner --email you@example.com --name "Full Name"
 * Local auth: prompts for a password via OWNER_PASSWORD env var (never stored in shell history files by us).
 * Supabase auth: the person signs up normally first; this script then promotes the existing user.
 */
import { db, closePool } from "@/lib/database/pool";
import { hashPassword, passwordProblems } from "@/lib/security/passwords";
import { env } from "@/lib/config/env";

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const email = get("email")?.toLowerCase();
  const name = get("name") ?? "";
  const role = get("role") ?? "owner";
  if (!email) throw new Error("--email is required");
  if (env().AUTH_PROVIDER === "supabase") {
    const u = await db.one<{ id: string }>("update users set role = $2, email_verified_at = coalesce(email_verified_at, now()) where email = $1 returning id", [email, role]);
    if (!u) throw new Error("No user with that email yet. Sign up on the website first, then rerun.");
    console.log(`Promoted ${email} to ${role}.`);
    return;
  }
  const password = process.env.OWNER_PASSWORD;
  if (!password) throw new Error("Set OWNER_PASSWORD in the environment for this command.");
  const problems = passwordProblems(password, email);
  if (problems.length) throw new Error(problems.join(" "));
  const hash = await hashPassword(password);
  await db.query(
    `insert into users (email, full_name, role, password_hash, email_verified_at) values ($1,$2,$3,$4, now())
     on conflict (email) do update set role = excluded.role, password_hash = excluded.password_hash, full_name = coalesce(nullif(excluded.full_name,''), users.full_name), email_verified_at = coalesce(users.email_verified_at, now())`,
    [email, name, role, hash],
  );
  console.log(`Account ready: ${email} (${role}).`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => closePool());
