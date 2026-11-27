import { test, expect } from "@playwright/test";
import { hashPassword, login, MFA_ENFORCED, sql, unique, watchErrors } from "./helpers";

test.describe("authentication & authorisation", () => {
  test("anonymous users are redirected from admin and portal", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)admin/);
    await page.goto("/portal/library");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password is rejected without revealing account existence", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#a-email", "owner@example.com");
    await page.fill("#a-password", "definitely-wrong-password");
    await page.locator("form button:not([type=button])").click();
    await expect(page.locator("form [role=alert]")).toContainText("Email or password is incorrect");
  });

  test("protected APIs reject anonymous callers", async ({ request }) => {
    for (const url of ["/api/admin/media", "/api/admin/export/contacts", "/api/admin/export/ledger", "/api/admin/export/orders"]) {
      expect((await request.get(url)).status(), url).toBe(403);
    }
    expect((await request.get("/api/files/not-a-valid-token")).status()).toBe(403);
    expect((await request.get("/api/receipts/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
    const hook = await request.post("/api/webhooks/paystack", { data: { event: "charge.success", data: { reference: "x" } }, headers: { "x-paystack-signature": "0".repeat(128) } });
    expect([401, 503]).toContain(hook.status()); // 503 when Paystack isn't configured, 401 bad signature otherwise
    const rev = await request.post("/api/internal/revalidate", { data: { tags: ["pages"] }, headers: { "x-internal-token": "forged" } });
    expect(rev.status()).toBe(403);
  });

  test("customers cannot reach the admin; staff roles are limited by permission", async ({ page }) => {
    const email = `${unique("cust")}@example.com`;
    // A verified customer account (password set directly to keep the test independent of email delivery).
    await sql("insert into users (email, full_name, password_hash, email_verified_at) values ($1, 'E2E Customer', $2, now())", [email, hashPassword("Correct-Horse-9921")]);
    await login(page, email, "Correct-Horse-9921");
    await expect(page).toHaveURL(/\/portal/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/portal/);
    await page.goto("/admin/payments");
    await expect(page).toHaveURL(/\/portal/);

    // Promote to content manager: website yes, payments no.
    await sql("update users set role = 'content_manager' where email = $1", [email]);
    if (MFA_ENFORCED) {
      // Production rule: staff without two-factor authentication get no permissions until they enrol.
      await page.goto("/admin/content");
      await expect(page).toHaveURL(/\/admin\/security\?setup=1/);
      await page.goto("/admin/payments");
      await expect(page).toHaveURL(/\/admin\/security\?setup=1/);
    } else {
      await page.goto("/admin/content");
      await expect(page.getByRole("heading", { name: "Content studio" })).toBeVisible();
      await page.goto("/admin/payments");
      await expect(page).toHaveURL(/\/admin\?denied=1/);
    }
    await sql("delete from sessions where user_id = (select id from users where email = $1)", [email]);
  });

  test("a customer cannot open another customer's class page (IDOR)", async ({ page }) => {
    const email = `${unique("idor")}@example.com`;
    await sql("insert into users (email, password_hash, email_verified_at) values ($1, $2, now())", [email, hashPassword("Correct-Horse-9921")]);
    const ev = await sql<{ id: string }>("select id from events where slug = 'demo-open-office-hours'");
    await login(page, email, "Correct-Horse-9921");
    const res = await page.goto(`/portal/events/${ev[0].id}`);
    expect(res?.status()).toBe(404);
    expect(await page.content()).not.toContain("example.com/demo-meeting");
  });

  test("meeting links never appear in public HTML", async ({ page }) => {
    await page.goto("/masterclasses/demo-linkedin-authority-masterclass");
    expect(await page.content()).not.toContain("demo-meeting");
  });
});

test.describe("admin workflows", () => {
  test("owner signs in and sees the dashboard with live data", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText("Net revenue")).toBeVisible();
    for (const path of ["/admin/crm", "/admin/crm/pipeline", "/admin/bookings", "/admin/services", "/admin/events", "/admin/academy", "/admin/shop", "/admin/payments", "/admin/payments/reconciliation",
      "/admin/website", "/admin/content", "/admin/content/calendar", "/admin/media", "/admin/proof", "/admin/partnerships", "/admin/marketing", "/admin/assessments", "/admin/analytics",
      "/admin/settings", "/admin/settings/users", "/admin/settings/emails", "/admin/settings/integrations", "/admin/system", "/admin/ai", "/admin/tasks"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1").first(), path).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("create, publish and view an article", async ({ page }) => {
    const title = `E2E article ${Date.now()}`;
    await login(page);
    await page.goto("/admin/content/new");
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Excerpt").fill("Testing the content studio end to end.");
    await page.locator('[role="textbox"][contenteditable="true"]').click();
    await page.keyboard.type("This is the body of an end-to-end test article.");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/Status: published/i)).toBeVisible({ timeout: 15_000 });
    const rows = await sql<{ slug: string; status: string }>("select slug, status from articles where title = $1", [title]);
    expect(rows[0].status).toBe("published");
    await page.goto(`/insights/${rows[0].slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await sql("delete from articles where title = $1", [title]);
  });

  test("create a contact and move it through the pipeline", async ({ page }) => {
    const email = `${unique("crm")}@example.com`;
    const name = `Pipeline ${Date.now()}`;
    await login(page);
    await page.goto("/admin/crm/new");
    await page.getByLabel("Full name", { exact: true }).fill(name);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Create contact" }).click();
    await page.waitForURL(/\/admin\/crm\/[0-9a-f-]{36}/);
    await page.getByLabel("Details").fill("Discovery call went well.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Discovery call went well.")).toBeVisible();
    await page.goto("/admin/crm/pipeline");
    const card = page.locator("li").filter({ hasText: name });
    await card.getByLabel(`Move ${name} to stage`).selectOption({ label: "Interested" });
    await expect.poll(async () => (await sql<{ name: string }>("select s.name from contacts c join pipeline_stages s on s.id = c.stage_id where c.email = $1", [email]))[0]?.name).toBe("Interested");
  });
});
