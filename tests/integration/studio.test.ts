import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closePool } from "@/lib/database/pool";
import { globalSearch } from "@/features/studio/application/search";
import { activityFeed } from "@/features/studio/application/activity";
import { onboardingSteps } from "@/features/studio/application/onboarding";
import type { SessionUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { requestTestimonial, contactForTestimonialToken } from "@/features/crm/application/testimonials";
import { resetData } from "../helpers";

afterAll(() => closePool());
const user = (perms: Permission[], id = "00000000-0000-0000-0000-000000000000"): SessionUser => ({
  id, email: "s@example.com", fullName: "S", role: "admin", emailVerified: true, permissions: new Set(perms), isStaff: true, mfaEnabled: true,
});

beforeEach(async () => {
  await resetData();
  const c = await db.one<{ id: string }>("insert into contacts (full_name, email, phone) values ('Akosua Mensah', 'akosua@example.com', '+233201234567') returning id");
  await db.query("insert into crm_activities (contact_id, kind, title) values ($1, 'form', 'Speaking enquiry received')", [c!.id]);
});

describe("global search & activity", () => {
  it("finds contacts by name, email or phone — only with permission", async () => {
    expect((await globalSearch(user(["crm:view"]), "akosua")).map((h) => h.kind)).toContain("Contact");
    expect((await globalSearch(user(["crm:view"]), "0123456")).length).toBe(1);
    expect(await globalSearch(user(["events:view"]), "akosua")).toEqual([]);
    expect(await globalSearch(user(["crm:view"]), "%")).toEqual([]); // wildcard alone is too short
    expect(await globalSearch(user(["crm:view"]), "%%")).toEqual([]); // escaped, matches nothing literal
  });

  it("shows customer activity only to CRM viewers and team actions only to auditors", async () => {
    expect((await activityFeed(user(["crm:view"]))).some((a) => a.title.includes("Speaking enquiry"))).toBe(true);
    expect(await activityFeed(user(["payments:view"]))).toEqual([]);
  });

  it("derives onboarding progress from real data", async () => {
    const owner = await db.one<{ id: string }>("insert into users (email, role) values ('onb@example.com','owner') on conflict (email) do update set role='owner' returning id");
    const steps = await onboardingSteps(owner!.id);
    expect(steps.find((s) => s.key === "security")!.done).toBe(false);
    expect(steps.find((s) => s.key === "profile")!.missing).toContain("business email");
    expect(steps.find((s) => s.key === "paystack")!.done).toBe(false);
    await db.query("update users set mfa_enabled_at = now() where role <> 'customer'");
    expect((await onboardingSteps(owner!.id)).find((s) => s.key === "security")!.done).toBe(true);
  });
});

describe("testimonial requests", () => {
  it("only asks real clients, once per 90 days, never suppressed addresses, with a verifiable link", async () => {
    const actor = (await db.one<{ id: string }>("insert into users (email, role) values ('tr@example.com','owner') on conflict (email) do update set role='owner' returning id"))!.id;
    const c = (await db.one<{ id: string }>("select id from contacts where email = 'akosua@example.com'"))!.id;
    await expect(requestTestimonial(c, actor)).rejects.toThrow(/Only clients/);
    await db.query(
      `insert into orders (reference, contact_id, email, customer_name, currency, subtotal_minor, total_minor, status, paid_at)
       values ('ORD-TESTIMONI1', $1, 'akosua@example.com', 'Akosua', 'GHS', 1000, 1000, 'paid', now())`, [c]);
    await requestTestimonial(c, actor);
    await expect(requestTestimonial(c, actor)).rejects.toThrow(/last 90 days/);
    const n = await db.one<{ id: string; recipient: string }>("select id, recipient from notifications where template_key = 'testimonial_request'");
    expect(n!.recipient).toBe("akosua@example.com");
    const job = await db.one<{ payload: { data: { testimonialUrl: string } } }>("select payload from jobs where type = 'notification.email' order by id desc limit 1");
    const token = new URL(job!.payload.data.testimonialUrl).searchParams.get("r")!;
    expect((await contactForTestimonialToken(token))!.email).toBe("akosua@example.com");
    expect(await contactForTestimonialToken(token.slice(0, -2) + "xx")).toBeNull();

    const other = (await db.one<{ id: string }>("insert into contacts (full_name, email) values ('Gone', 'gone@example.com') returning id"))!.id;
    await db.query(`insert into orders (reference, contact_id, email, customer_name, currency, subtotal_minor, total_minor, status, paid_at) values ('ORD-TESTIMONI2', $1, 'gone@example.com', 'Gone', 'GHS', 1000, 1000, 'paid', now())`, [other]);
    await db.query("insert into email_suppressions (email, reason) values ('gone@example.com', 'unsubscribed') on conflict do nothing");
    await expect(requestTestimonial(other, actor)).rejects.toThrow(/unsubscribed/);
  });
});

describe("abandoned checkout reminders", () => {
  it("emails consented contacts once, never non-consented or later buyers", async () => {
    const { sendAbandonedCheckoutReminders } = await import("@/features/automation/application/scheduled");
    const mk = async (email: string, consent: boolean, status: string, hoursAgo: number, product: string) => {
      const c = (await db.one<{ id: string }>("select id from contacts where email = $1", [email]))?.id
        ?? (await db.one<{ id: string }>("insert into contacts (full_name, email, consent_marketing) values ($1, $2, $3) returning id", [email, email, consent]))!.id;
      const o = (await db.one<{ id: string }>(
        `insert into orders (reference, contact_id, email, customer_name, currency, subtotal_minor, total_minor, status, paid_at, created_at)
         values ('ORD-' || upper(substr(md5(random()::text), 1, 10)), $1, $2, 'X', 'GHS', 1000, 1000, $3::text, case when $3::text = 'paid' then now() end, now() - make_interval(mins => $4)) returning id`,
        [c, email, status, Math.round(hoursAgo * 60)]))!.id;
      await db.query("insert into order_items (order_id, item_type, item_id, description, unit_price_minor, total_minor) values ($1, 'product', $2, 'Workbook', 1000, 1000)", [o, product]);
      return o;
    };
    const p1 = "11111111-1111-1111-1111-111111111111";
    await mk("yes@example.com", true, "expired", 5, p1);
    await mk("no@example.com", false, "expired", 5, p1);
    await mk("later@example.com", true, "expired", 6, p1);
    await mk("later@example.com", true, "paid", 1, p1);
    await mk("fresh@example.com", true, "pending", 0.5, p1);
    expect(await sendAbandonedCheckoutReminders()).toBe(1);
    expect(await sendAbandonedCheckoutReminders()).toBe(0);
    const sent = await db.query<{ recipient: string }>("select recipient from notifications where template_key = 'abandoned_checkout'");
    expect(sent.map((s) => s.recipient)).toEqual(["yes@example.com"]);
  });
});
