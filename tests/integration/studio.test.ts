import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closePool } from "@/lib/database/pool";
import { globalSearch } from "@/features/studio/application/search";
import { activityFeed } from "@/features/studio/application/activity";
import { onboardingSteps } from "@/features/studio/application/onboarding";
import type { SessionUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
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
    expect(steps.find((s) => s.key === "mfa")!.done).toBe(false);
    expect(steps.find((s) => s.key === "paystack")!.done).toBe(false);
    await db.query("update users set mfa_enabled_at = now() where role <> 'customer'");
    expect((await onboardingSteps(owner!.id)).find((s) => s.key === "mfa")!.done).toBe(true);
  });
});
