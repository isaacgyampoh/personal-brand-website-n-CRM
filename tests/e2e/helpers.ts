import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomBytes, scryptSync } from "node:crypto";

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

export async function login(page: Page, email = OWNER.email, password = OWNER.password) {
  // The login rate limiter is real; the suite signs in many times, so clear its counters for this account (local test DB only).
  await sql("delete from rate_limits where key like 'login-%'");
  await page.goto("/login");
  await page.fill("#a-email", email);
  await page.fill("#a-password", password);
  await page.locator("form button:not([type=button])").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
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
