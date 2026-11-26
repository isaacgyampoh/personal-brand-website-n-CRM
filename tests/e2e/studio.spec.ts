import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { hashPassword, login, sql, unique, watchErrors } from "./helpers";

/** RFC 6238 TOTP, independent re-implementation for the test (the app's module is server-only). */
function totp(base32: string, step = Math.floor(Date.now() / 30000)): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of base32.replace(/\s/g, "")) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", Buffer.from(bytes)).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function noOverflow(page: Page) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0], "horizontal overflow").toBeLessThanOrEqual(w[1] + 1);
}

test.describe("Studio security", () => {
  test("staff member enrols in MFA, then signs in with a recovery code; bad codes are refused", async ({ page }) => {
    const email = `${unique("mfa")}@example.com`;
    await sql("insert into users (email, full_name, role, password_hash, email_verified_at) values ($1, 'MFA Tester', 'booking_manager', $2, now())", [email, hashPassword("Correct-Horse-9921")]);
    await login(page, email, "Correct-Horse-9921");
    await page.goto("/admin/security");
    await page.getByRole("button", { name: "Set up two-factor authentication" }).click();
    const secret = (await page.getByTestId("mfa-secret").innerText()).replace(/\s/g, "");
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await page.fill("input[name=code]", "000000");
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("didn't match");
    await page.fill("input[name=code]", totp(secret));
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByText("Save these recovery codes")).toBeVisible();
    const recovery = (await page.getByTestId("recovery-codes").locator("li").first().innerText()).trim();
    expect(recovery).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);

    // Fresh sign-in: password alone is not enough.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill("#a-email", email);
    await page.fill("#a-password", "Correct-Horse-9921");
    await page.locator("form button:not([type=button])").click();
    await page.waitForURL(/\/login\/mfa/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/); // pending MFA session grants nothing
    await page.goto("/login/mfa");
    await sql("delete from rate_limits where key like 'mfa%'");
    await page.fill("#a-code", "123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("isn't valid");
    await page.fill("#a-code", recovery);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/admin/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const left = await sql<{ n: number }>("select jsonb_array_length(mfa_recovery_codes) as n from users where email = $1", [email]);
    expect(left[0].n).toBe(9);
  });
});

test.describe("Integration Centre", () => {
  test.afterEach(async () => { await sql("delete from integration_configs where provider = 'smtp'"); });

  test("secrets are never sent back, private hosts are refused and status never claims Connected untested", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page);
    await page.goto("/admin/settings/integrations");
    await expect(page.getByTestId("status-paystack")).toHaveText("Not configured");
    const card = page.locator("section#smtp");
    await card.getByRole("button", { name: "Configure" }).click();
    await card.locator('input[name="f:host"]').fill("127.0.0.1");
    await card.locator('input[name="f:username"]').fill("mailer");
    await card.locator('input[name="f:password"]').fill("Sup3r-Secret-Smtp-Pass");
    await card.locator('input[name="f:fromEmail"]').fill("hello@example.com");
    await card.locator('input[name="f:fromName"]').fill("Studio");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved. Run Test connection to verify.")).toBeVisible();
    await page.reload();
    const html = await page.content();
    expect(html).not.toContain("Sup3r-Secret-Smtp-Pass");
    const stored = await sql<{ s: string }>("select coalesce(secrets_encrypted,'') || settings::text as s from integration_configs where provider = 'smtp'");
    expect(stored[0].s).not.toContain("Sup3r-Secret-Smtp-Pass");
    await expect(page.getByTestId("status-smtp")).not.toHaveText("Connected");
    const smtp = page.locator("section#smtp");
    if (!(await smtp.getByRole("button", { name: "Test connection" }).isVisible())) await smtp.getByRole("button", { name: "Configure" }).click();
    await smtp.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText(/private or reserved address/)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("status-smtp")).toHaveText(/Connection failed|Disabled/);
    expect(errors).toEqual([]);
  });
});

test.describe("masterclass quick create → public page", () => {
  test("owner creates and publishes a free online masterclass, then shares it", async ({ page }) => {
    await login(page);
    await page.goto("/admin/events/quick");
    const title = `E2E Quick Masterclass ${Date.now()}`;
    await page.fill('input[name="title"]', title);
    await page.fill('textarea[name="summary"]', "A short end-to-end test masterclass about building a credible personal brand.");
    const d = new Date(Date.now() + 20 * 86400_000);
    const local = `${d.toISOString().slice(0, 10)}T18:00`;
    await page.fill('input[name="startsAt"]', local);
    await page.getByLabel("Free").check();
    await page.selectOption('select[name="meetingProvider"]', "manual");
    await page.fill('input[name="meetingUrl"]', "https://meet.example.com/e2e-quick");
    await page.fill('input[name="seats"]', "30");
    await page.getByRole("button", { name: "Publish now" }).click();
    await page.waitForURL(/\/admin\/events\/[0-9a-f-]+\/ready/);
    await expect(page.getByRole("heading", { name: "Your masterclass is live" })).toBeVisible();
    const link = await page.locator("code").first().innerText();
    const path = new URL(link).pathname;
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    expect(await page.content()).not.toContain("meet.example.com/e2e-quick"); // link only for confirmed attendees
  });
});

test.describe("finance, search & activity", () => {
  test("finance, search and activity pages render live data", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page);
    await page.goto("/admin/finance");
    await expect(page.getByRole("heading", { name: "Finance" })).toBeVisible();
    await expect(page.getByText("Net revenue")).toBeVisible();
    const csv = await page.request.get("/api/admin/export/finance?format=csv");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const xlsx = await page.request.get("/api/admin/export/finance?format=xlsx");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    await page.goto("/admin/search?q=demo");
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await page.goto("/admin/activity");
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await page.goto("/admin/onboarding");
    await expect(page.getByRole("progressbar")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Studio is usable on a phone @mobile", async ({ page }) => {
    await login(page);
    for (const path of ["/admin", "/admin/finance", "/admin/settings/integrations", "/admin/events/quick", "/admin/onboarding", "/admin/security"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow(page);
    }
  });
});
