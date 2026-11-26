import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closePool } from "@/lib/database/pool";
import { quickCreateMasterclass } from "@/features/events/application/admin";
import { publicTickets } from "@/features/events/application/registration";
import { eventRepo } from "@/features/events/infrastructure/repository";
import { invalidateIntegrationCache } from "@/lib/integrations/store";
import { resetData } from "../helpers";

afterAll(() => closePool());
let actor: string;
beforeEach(async () => {
  await resetData();
  await db.query("delete from integration_configs");
  invalidateIntegrationCache();
  actor = (await db.one<{ id: string }>("insert into users (email, role) values ('owner-q@example.com','owner') on conflict (email) do update set role = 'owner' returning id"))!.id;
});

const inDays = (d: number) => new Date(Date.now() + d * 86400_000);
const base = {
  title: "Personal Branding for Professionals", summary: "A practical 90-minute masterclass on building a credible personal brand.",
  format: "online", startsAt: inDays(14), durationMinutes: 90, seats: 50, pricing: "paid", price: "250", currency: "GHS",
  earlyBirdPrice: "", earlyBirdEndsAt: null, registrationClosesAt: null, waitlist: true, meetingProvider: "manual",
  meetingUrl: "https://meet.example.com/abc", publish: false,
};

describe("masterclass quick create", () => {
  it("creates event, early-bird + standard tickets, joining link and publishes", async () => {
    const id = await quickCreateMasterclass({ ...base, earlyBirdPrice: "150", earlyBirdEndsAt: inDays(7), publish: true }, actor);
    const e = await db.one<{ status: string; kind: string; capacity: number; waitlist_enabled: boolean; ends_at: Date; starts_at: Date; slug: string }>("select * from events where id = $1", [id]);
    expect(e).toMatchObject({ status: "published", kind: "masterclass", capacity: 50, waitlist_enabled: true });
    expect(e!.ends_at.getTime() - e!.starts_at.getTime()).toBe(90 * 60_000);
    const tickets = await db.query<{ name: string; price_minor: number; sales_end_at: Date | null; sales_start_at: Date | null }>("select * from ticket_types where event_id = $1 order by position", [id]);
    expect(tickets.map((t) => [t.name, t.price_minor])).toEqual([["Early bird", 15000], ["Standard", 25000]]);
    expect(tickets[1].sales_start_at?.getTime()).toBe(tickets[0].sales_end_at?.getTime());
    const access = await db.one<{ meeting_provider: string; meeting_url: string }>("select * from event_access where event_id = $1", [id]);
    expect(access).toMatchObject({ meeting_provider: "manual", meeting_url: "https://meet.example.com/abc" });
    // Only the early-bird ticket is on sale now.
    const row = await eventRepo.bySlug(e!.slug);
    const onSale = (await publicTickets(row!)).filter((t) => t.onSale).map((t) => t.name);
    expect(onSale).toEqual(["Early bird"]);
  });

  it("validates with plain-language errors and refuses unconnected meeting providers", async () => {
    await expect(quickCreateMasterclass({ ...base, startsAt: inDays(-1) }, actor)).rejects.toThrow(/past/);
    await expect(quickCreateMasterclass({ ...base, meetingUrl: "" }, actor)).rejects.toThrow(/meeting link/);
    await expect(quickCreateMasterclass({ ...base, format: "in_person", meetingProvider: "none" }, actor)).rejects.toThrow(/venue/);
    await expect(quickCreateMasterclass({ ...base, earlyBirdPrice: "300", earlyBirdEndsAt: inDays(3) }, actor)).rejects.toThrow(/lower/);
    await expect(quickCreateMasterclass({ ...base, meetingProvider: "zoom" }, actor)).rejects.toThrow(/Zoom isn't connected/);
    expect((await db.one<{ n: number }>("select count(*)::int as n from events"))!.n).toBe(0);
  });

  it("free in-person masterclass saves as a draft", async () => {
    const id = await quickCreateMasterclass({ ...base, format: "in_person", venueName: "Accra Business Hub", meetingProvider: "none", pricing: "free", price: "" }, actor);
    const t = await db.one<{ name: string; price_minor: number }>("select name, price_minor from ticket_types where event_id = $1", [id]);
    expect(t).toEqual({ name: "Free registration", price_minor: 0 });
    expect((await db.one<{ status: string }>("select status from events where id = $1", [id]))!.status).toBe("draft");
    expect((await db.one<{ meeting_provider: string }>("select meeting_provider from event_access where event_id = $1", [id]))!.meeting_provider).toBe("none");
  });
});
