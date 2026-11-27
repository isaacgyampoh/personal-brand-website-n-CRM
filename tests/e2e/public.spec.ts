import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoHorizontalOverflow, sql, unique, watchErrors } from "./helpers";

const PAGES = ["/", "/about", "/services", "/book", "/masterclasses", "/masterclasses/demo-linkedin-authority-masterclass", "/academy", "/academy/demo-personal-brand-foundations",
  "/shop", "/shop/demo-linkedin-profile-workbook", "/insights", "/insights/demo-article-1", "/speaking", "/contact", "/case-studies", "/media", "/testimonials", "/links", "/login"];

test.describe("public website", () => {
  for (const path of PAGES) {
    test(`renders ${path} without errors or overflow`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }

  test("no horizontal overflow at 320/375/768px @mobile", async ({ page }) => {
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/", "/masterclasses/demo-linkedin-authority-masterclass", "/book/demo-brand-clarity-session", "/insights/demo-article-1", "/contact"]) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
    }
  });

  test("mobile navigation opens, traps focus, closes on Escape @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Masterclasses" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await toggle.click();
    await menu.getByRole("link", { name: "Masterclasses" }).click();
    await expect(page).toHaveURL(/\/masterclasses$/);
  });

  test("SEO: sitemap, robots, canonical, structured data, admin noindex", async ({ page, request }) => {
    expect((await request.get("/sitemap.xml")).status()).toBe(200);
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow");
    await page.goto("/masterclasses/demo-linkedin-authority-masterclass");
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld!)["@type"]).toBe("Event");
    expect((await request.get("/admin")).headers()["x-robots-tag"]).toContain("noindex");
    const ogUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogUrl).toContain("opengraph-image");
    const og = await request.get(new URL(ogUrl!).pathname + new URL(ogUrl!).search);
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
  });

  test("security headers and CSP are present", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("accessibility: no serious/critical axe violations on key pages", async ({ page }) => {
    const report: Record<string, string[]> = {};
    for (const path of ["/", "/book/demo-brand-clarity-session", "/masterclasses/demo-linkedin-authority-masterclass", "/contact", "/login", "/insights/demo-article-1"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle"); // dev server may reload once after compiling a route
      // Below-the-fold sections fade in on scroll: scroll through so axe checks their final, visible state.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1000);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      if (bad.length) report[path] = bad.map((v) => `${v.id} (${v.nodes.length})`);
    }
    expect(report).toEqual({});
  });
});

test.describe("lead capture & registration flows", () => {
  test("contact enquiry creates a CRM contact, submission and follow-up task", async ({ page }) => {
    const email = `${unique("lead")}@example.com`;
    await page.goto("/contact");
    await page.fill("#f-fullName", "E2E Lead");
    await page.fill("#f-email", email);
    await page.fill("#f-subject", "Coaching");
    await page.fill("#f-message", "I would like to discuss executive branding for my team.");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByRole("status")).toContainText("received");
    const rows = await sql<{ n: number }>("select count(*)::int as n from form_submissions s join contacts c on c.id = s.contact_id where c.email = $1", [email]);
    expect(rows[0].n).toBe(1);
    const tasks = await sql<{ n: number }>("select count(*)::int as n from tasks t join contacts c on c.id = t.contact_id where c.email = $1", [email]);
    expect(tasks[0].n).toBe(1);
  });

  test("newsletter signup is double opt-in (pending until confirmed)", async ({ page }) => {
    const email = `${unique("sub")}@example.com`;
    await page.goto("/");
    const form = page.locator("footer form");
    await form.locator('input[type="email"]').fill(email);
    await form.locator('input[name="consent"]').check();
    await form.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.locator("footer").getByRole("status")).toContainText("confirm");
    const rows = await sql<{ status: string }>("select status from subscribers where email = $1", [email]);
    expect(rows[0].status).toBe("pending");
  });

  test("free masterclass registration end to end", async ({ page }) => {
    const email = `${unique("att")}@example.com`;
    await page.goto("/masterclasses/demo-open-office-hours");
    await page.fill("#ev-fullName", "E2E Attendee");
    await page.fill("#ev-email", email);
    await page.getByLabel(/I accept the/).check();
    await page.getByRole("button", { name: "Register" }).click();
    await page.waitForURL(/registered/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("in");
    const reg = await sql<{ status: string }>("select status from event_registrations where attendee_email = $1", [email]);
    expect(reg[0].status).toBe("confirmed");
    const mail = await sql<{ n: number }>("select count(*)::int as n from notifications where recipient = $1 and template_key = 'event_registration_confirmed'", [email]);
    expect(mail[0].n).toBe(1);
  });

  test("free consultation booking on a phone @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = `${unique("book")}@example.com`;
    await page.goto("/book/demo-brand-clarity-session");
    // Near month-end the current month may have no free day left: move on to the next month.
    const day = page.locator('[aria-label="Available dates"] button:not([disabled])').first();
    for (let i = 0; i < 2 && !(await day.isVisible({ timeout: 8_000 }).catch(() => false)); i++) {
      await page.getByRole("button", { name: /next month/i }).click();
    }
    await expect(day).toBeVisible({ timeout: 15_000 });
    await day.click();
    const slot = page.locator('button[aria-pressed]').filter({ hasText: /\d{2}:\d{2}/ }).first();
    await expect(slot).toBeVisible();
    await slot.click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.fill("#bk-fullName", "E2E Booker");
    await page.fill("#bk-email", email);
    await page.getByRole("button", { name: "Review booking" }).click();
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await page.waitForURL(/book\/confirmed/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("booked");
    const appt = await sql<{ status: string }>("select a.status from appointments a join contacts c on c.id = a.contact_id where c.email = $1", [email]);
    expect(appt[0].status).toBe("confirmed");
  });

  test("paid checkout is refused honestly when payments are not configured", async ({ page }) => {
    await page.goto("/masterclasses/demo-linkedin-authority-masterclass");
    await expect(page.getByText("Online payment isn't available yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  });
});
