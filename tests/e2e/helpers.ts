import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { createHmac, randomBytes, scryptSync } from "node:crypto";

/** Same format as lib/security/passwords.ts (that module is server-only). */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw.normalize("NFKC"), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", 32768, 8, 1, salt.toString("base64"), hash.toString("base64")].join("$");
}

// Local test account only. The password comes from the environment, never from the repository.
export const OWNER = { email: process.env.E2E_OWNER_EMAIL ?? "owner@example.com", password: process.env.E2E_OWNER_PASSWORD ?? "" };
if (!OWNER.password) throw new Error("Set E2E_OWNER_PASSWORD (and E2E_OWNER_EMAIL) for the local test owner before running E2E tests.");
export const DB_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost/brand_dev?host=/tmp";

export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return (await c.query(query, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** True when the target enforces staff MFA (production/staging). Set E2E_OWNER_TOTP_SECRET for the test owner. */
export const MFA_ENFORCED = process.env.E2E_MFA_ENFORCED === "1";

export function totp(base32: string, step = Math.floor(Date.now() / 30000)): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of base32.replace(/\s/g, "")) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", Buffer.from(bytes)).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Next unused TOTP step (the app rejects replayed codes), waiting for a new 30 s window if needed. */
async function freshCode(secret: string, email: string): Promise<string> {
  // The last accepted step lives in the database, so this also works across test worker processes.
  const lastStep = Number((await sql<{ s: string | null }>("select mfa_last_step as s from users where email = $1", [email]))[0]?.s ?? 0);
  let step = Math.floor(Date.now() / 30000);
  if (step <= lastStep) {
    await new Promise((r) => setTimeout(r, (lastStep + 1) * 30000 - Date.now() + 500));
    step = Math.floor(Date.now() / 30000);
  }
  return totp(secret, step);
}

export async function login(page: Page, email = OWNER.email, password = OWNER.password) {
  // The login rate limiter is real; the suite signs in many times, so clear its counters (test database only).
  await sql("delete from rate_limits where key like 'login-%' or key like 'mfa%'");
  await page.goto("/login");
  await page.fill("#a-email", email);
  await page.fill("#a-password", password);
  await page.locator("form button:not([type=button])").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login") || u.pathname === "/login/mfa");
  if (new URL(page.url()).pathname === "/login/mfa") {
    const secret = email === OWNER.email ? process.env.E2E_OWNER_TOTP_SECRET : undefined;
    if (!secret) throw new Error("This account needs MFA; set E2E_OWNER_TOTP_SECRET for the test owner.");
    await page.fill("#a-code", await freshCode(secret, email));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
}

/** Fails on uncaught page errors / console errors (ignores dev-only noise). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text())) errors.push(m.text()); });
  return errors;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(1);
}

export const unique = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
