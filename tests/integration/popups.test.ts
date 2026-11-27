import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Outside Next.js there is no data cache: evaluate live every time.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));

import { db, closePool } from "@/lib/database/pool";
import { registerForEvent } from "@/features/events/application/registration";
import { popupsForPath, popupStats, savePopup, setEventPopup, setPopupStatus } from "@/features/popups/application/popups";
import { popupInput } from "@/features/popups/domain/popups";
import { makeEvent, resetData } from "../helpers";

const buyer = (i: number) => ({ fullName: `Buyer ${i}`, email: `buyer${i}@example.com`, phone: "", consentMarketing: false });
let actor: string;

async function custom(o: Record<string, unknown> = {}) {
  const v = popupInput.parse({ name: "Coaching", kind: "coaching", layout: "editorial", heading: "Book a call", destination: "/services", priority: "5", ...o });
  const id = await savePopup(null, { ...v, startsAt: (o.startsAt as Date) ?? null, endsAt: (o.endsAt as Date) ?? null }, actor);
  await setPopupStatus(id, "active", actor);
  return id;
}

beforeEach(async () => {
  await resetData();
  await db.query("delete from site_popups");
  actor = (await db.one<{ id: string }>("select id from users order by created_at limit 1"))?.id
    ?? (await db.one<{ id: string }>("insert into users (email, full_name, role, status) values ('popup-owner@example.com','Owner','owner','active') returning id"))!.id;
});
afterAll(async () => { await closePool(); });

describe("website pop-ups — event lifecycle", () => {
  it("publishing the event switch shows a pop-up built from live event data", async () => {
    const e = await makeEvent({ capacity: 50 });
    await setEventPopup(e.id, true, actor);
    const [p] = await popupsForPath("/");
    expect(p.kind).toBe("event");
    expect(p.heading).toBe(e.slug); // event title (helpers use the slug as title)
    expect(p.href).toBe(`/masterclasses/${e.slug}#register`);
    expect(p.event?.priceLabel).toBe("Free");
    expect(p.buttonText).toBe("Reserve your free seat");
    expect(p.event?.seatsLabel).toBeNull(); // 50 left: not scarce, so no seat claim
  });

  it("never shows on its own event page, checkout, portal or Studio", async () => {
    const e = await makeEvent();
    await setEventPopup(e.id, true, actor);
    expect(await popupsForPath(`/masterclasses/${e.slug}`)).toHaveLength(0);
    for (const p of ["/checkout/complete", "/portal", "/admin", "/book/confirmed"]) expect(await popupsForPath(p), p).toHaveLength(0);
    expect(await popupsForPath("/about")).toHaveLength(1);
  });

  it("shows true scarcity, then hides when sold out (no waiting list)", async () => {
    const e = await makeEvent({ capacity: 2 });
    await db.query("update events set waitlist_enabled = false where id = $1", [e.id]);
    await setEventPopup(e.id, true, actor);
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: buyer(1), attendees: [buyer(1)] });
    expect((await popupsForPath("/"))[0].event?.seatsLabel).toBe("Only 1 seat left");
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: buyer(2), attendees: [buyer(2)] });
    expect(await popupsForPath("/")).toHaveLength(0);
  });

  it("switches to Join the waiting list when sold out with a waiting list", async () => {
    const e = await makeEvent({ capacity: 1 });
    await db.query("update events set waitlist_enabled = true where id = $1", [e.id]);
    await setEventPopup(e.id, true, actor);
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: buyer(1), attendees: [buyer(1)] });
    const [p] = await popupsForPath("/");
    expect(p.buttonText).toBe("Join the waiting list");
    expect(p.event?.seatsLabel).toBe("Fully booked");
  });

  it("hides when registration closes, the event is cancelled, unpublished or over", async () => {
    const e = await makeEvent();
    await setEventPopup(e.id, true, actor);
    expect(await popupsForPath("/")).toHaveLength(1);
    await db.query("update events set registration_closes_at = now() - interval '1 minute' where id = $1", [e.id]);
    expect(await popupsForPath("/")).toHaveLength(0);
    await db.query("update events set registration_closes_at = null, status = 'cancelled' where id = $1", [e.id]);
    expect(await popupsForPath("/")).toHaveLength(0);
    await db.query("update events set status = 'draft' where id = $1", [e.id]);
    expect(await popupsForPath("/")).toHaveLength(0);
    await db.query("update events set status = 'published', starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = $1", [e.id]);
    expect(await popupsForPath("/")).toHaveLength(0);
  });

  it("shows a paid price and turning the switch off hides it", async () => {
    const e = await makeEvent({ price: 25000 });
    await setEventPopup(e.id, true, actor);
    const [p] = await popupsForPath("/");
    expect(p.event?.priceLabel).toMatch(/250/);
    expect(p.buttonText).toBe("Register now");
    await setEventPopup(e.id, false, actor);
    expect(await popupsForPath("/")).toHaveLength(0);
  });
});

describe("website pop-ups — campaigns", () => {
  it("orders by priority and excludes paused, scheduled and expired campaigns", async () => {
    const e = await makeEvent();
    await setEventPopup(e.id, true, actor); // priority 10
    const low = await custom({ priority: "5" });
    await custom({ name: "Future", startsAt: new Date(Date.now() + 86400_000) });
    await custom({ name: "Expired", startsAt: new Date(Date.now() - 2 * 86400_000), endsAt: new Date(Date.now() - 86400_000) });
    const paused = await custom({ name: "Paused" });
    await setPopupStatus(paused, "paused", actor);
    const list = await popupsForPath("/");
    expect(list.map((p) => p.kind)).toEqual(["event", "coaching"]);
    expect(list[1].id).toBe(low);
  });

  it("respects homepage-only and selected-page targeting", async () => {
    await custom({ pages: "home" });
    await custom({ name: "About only", pages: "selected", pagePaths: "/about" });
    expect((await popupsForPath("/")).map((p) => p.heading)).toHaveLength(1);
    expect(await popupsForPath("/about")).toHaveLength(1);
    expect(await popupsForPath("/services")).toHaveLength(0);
  });

  it("counts impressions, clicks, dismissals and real attributed registrations", async () => {
    const e = await makeEvent({ capacity: 10 });
    const id = (await setEventPopup(e.id, true, actor))!;
    await db.query(`insert into popup_events (popup_id, name, visitor_hash, device, path) values
      ($1,'impression','v1','mobile','/'), ($1,'impression','v2','desktop','/'), ($1,'impression','v1','mobile','/about'),
      ($1,'click','v1','mobile','/'), ($1,'dismiss','v2','desktop','/')`, [id]);
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: buyer(1), attendees: [buyer(1)], attribution: { popupId: id } });
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: buyer(2), attendees: [buyer(2)] }); // not from the pop-up
    const s = (await popupStats(new Date(Date.now() - 3600_000), new Date(Date.now() + 3600_000), [id])).get(id)!;
    expect(s).toMatchObject({ impressions: 3, visitors: 2, clicks: 1, dismissals: 1, registrations: 1, conversions: 1, paidOrders: 0, revenueMinor: 0 });
  });
});
