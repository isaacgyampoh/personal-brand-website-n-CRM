import { describe, expect, it } from "vitest";
import { eventPopupState, pathAllowed, pathTargeted, popupInput, seatsLabel, type EventSnapshot } from "@/features/popups/domain/popups";

const now = new Date("2026-12-01T10:00:00Z");
const ev = (o: Partial<EventSnapshot> = {}): EventSnapshot => ({
  status: "published", starts_at: new Date("2026-12-10T15:00:00Z"), ends_at: new Date("2026-12-10T17:00:00Z"),
  registration_opens_at: null, registration_closes_at: null, waitlist_enabled: false, seatsLeft: 12, ticketsOnSale: 1, ...o,
});

describe("event pop-up lifecycle", () => {
  it("shows Register while registration is open with seats", () => expect(eventPopupState(ev(), now)).toBe("register"));
  it("shows Register for unlimited seats", () => expect(eventPopupState(ev({ seatsLeft: null }), now)).toBe("register"));
  it("hides when registration has closed", () => expect(eventPopupState(ev({ registration_closes_at: new Date("2026-11-30T00:00:00Z") }), now)).toBe("hidden"));
  it("hides before registration opens", () => expect(eventPopupState(ev({ registration_opens_at: new Date("2026-12-02T00:00:00Z") }), now)).toBe("hidden"));
  it("hides once the event has started (registration closes at start by default)", () => expect(eventPopupState(ev(), new Date("2026-12-10T15:01:00Z"))).toBe("hidden"));
  it("hides after the event ended", () => expect(eventPopupState(ev(), new Date("2026-12-11T00:00:00Z"))).toBe("hidden"));
  it("hides when cancelled", () => expect(eventPopupState(ev({ status: "cancelled" }), now)).toBe("hidden"));
  it("hides when unpublished (draft)", () => expect(eventPopupState(ev({ status: "draft" }), now)).toBe("hidden"));
  it("hides when completed", () => expect(eventPopupState(ev({ status: "completed" }), now)).toBe("hidden"));
  it("hides when sold out without a waiting list", () => expect(eventPopupState(ev({ seatsLeft: 0 }), now)).toBe("hidden"));
  it("switches to the waiting list when sold out with one", () => expect(eventPopupState(ev({ seatsLeft: 0, waitlist_enabled: true }), now)).toBe("waitlist"));
  it("treats no tickets on sale as sold out", () => expect(eventPopupState(ev({ ticketsOnSale: 0, seatsLeft: null }), now)).toBe("hidden"));
});

describe("seat line", () => {
  it("is only shown when scarce and true", () => {
    expect(seatsLabel(null)).toBeNull();
    expect(seatsLabel(0)).toBeNull();
    expect(seatsLabel(150)).toBeNull();
    expect(seatsLabel(1)).toBe("Only 1 seat left");
    expect(seatsLabel(7)).toBe("Only 7 seats left");
  });
});

describe("page targeting", () => {
  it("never shows in Studio, portal, checkout, payment confirmation or sign-in pages", () => {
    for (const p of ["/admin", "/admin/website", "/studio/x", "/portal", "/portal/events/1", "/checkout/complete", "/checkout/retry", "/login", "/register",
      "/book", "/book/discovery-call", "/book/confirmed", "/book/manage/abc", "/masterclasses/x/registered", "/api/popups", "/reset-password"]) expect(pathAllowed(p), p).toBe(false);
    for (const p of ["/", "/about", "/services", "/masterclasses", "/masterclasses/x", "/links", "/insights/a"]) expect(pathAllowed(p), p).toBe(true);
  });
  it("respects all / home / selected pages", () => {
    expect(pathTargeted({ pages: "all", page_paths: [] }, "/about")).toBe(true);
    expect(pathTargeted({ pages: "all", page_paths: [] }, "/checkout/complete")).toBe(false);
    expect(pathTargeted({ pages: "home", page_paths: [] }, "/")).toBe(true);
    expect(pathTargeted({ pages: "home", page_paths: [] }, "/about")).toBe(false);
    const sel = { pages: "selected" as const, page_paths: ["/about", "/insights/*"] };
    expect(pathTargeted(sel, "/about")).toBe(true);
    expect(pathTargeted(sel, "/about/")).toBe(true);
    expect(pathTargeted(sel, "/insights/linkedin-tips")).toBe(true);
    expect(pathTargeted(sel, "/services")).toBe(false);
  });
});

describe("Studio input", () => {
  const base = { name: "Test", kind: "coaching", layout: "editorial", heading: "Hi", destination: "/services" };
  it("accepts a valid promotion", () => expect(popupInput.safeParse(base).success).toBe(true));
  it("requires an event for event pop-ups", () => expect(popupInput.safeParse({ ...base, kind: "event" }).success).toBe(false));
  it("rejects unsafe destinations", () => {
    for (const d of ["javascript:alert(1)", "//evil.com", "http://insecure.com", "data:text/html,x"]) expect(popupInput.safeParse({ ...base, destination: d }).success, d).toBe(false);
    expect(popupInput.safeParse({ ...base, destination: "https://example.org/guide.pdf" }).success).toBe(true);
  });
  it("rejects invalid colours", () => expect(popupInput.safeParse({ ...base, accent: "red;background:url(x)" }).success).toBe(false));
  it("requires pages when targeting selected pages", () => expect(popupInput.safeParse({ ...base, pages: "selected", pagePaths: "" }).success).toBe(false));
  it("drops malformed page paths", () => {
    const r = popupInput.parse({ ...base, pages: "selected", pagePaths: "/about\nhttps://x.com\n/insights/*" });
    expect(r.pagePaths).toEqual(["/about", "/insights/*"]);
  });
});
