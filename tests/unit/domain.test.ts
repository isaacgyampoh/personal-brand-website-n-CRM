import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { computeDiscount, formatMoney, parseMajorToMinor } from "@/lib/money";
import { addDaysToKey, dateKey, fromLocalInput, fromWallClock, toLocalInput, toWallClock } from "@/lib/time";
import { computeSlots, blockRange, withinCustomerCutoff, groupSlotKey } from "@/features/bookings/domain/availability";
import { computeTotals, discountProblem, type DiscountCode, type LineItem } from "@/features/commerce/domain/order";
import { parseCsv, safeCell, toCsv } from "@/lib/csv";
import { renderEmail } from "@/features/notifications/domain/templates";
import { createPaystackGateway } from "@/features/payments/infrastructure/paystack";
import { plainText, docFromText } from "@/features/content/domain/rich-text";
import { contactWhere } from "@/features/crm/domain/segments";
import { pageDataSchema } from "@/features/website-builder/domain/blocks";
import { registrationState, ticketOnSale, joinWindow } from "@/features/events/domain/rules";
import { sniffFileType } from "@/features/media/domain/file-types";
import { scoreAssessment, type AssessmentDefinition } from "@/features/marketing/domain/assessment";

describe("money", () => {
  it("parses major units to integer minor units", () => {
    expect(parseMajorToMinor("1,250.50")).toBe(125050);
    expect(parseMajorToMinor("0")).toBe(0);
    expect(parseMajorToMinor("12.3")).toBe(1230);
    expect(() => parseMajorToMinor("12.345")).toThrow();
    expect(() => parseMajorToMinor("-5")).toThrow();
    expect(() => parseMajorToMinor("abc")).toThrow();
  });
  it("never discounts more than the subtotal", () => {
    expect(computeDiscount(10000, { kind: "percent", value: 25 }, "GHS")).toBe(2500);
    expect(computeDiscount(10000, { kind: "fixed", value: 50000, currency: "GHS" }, "GHS")).toBe(10000);
    expect(computeDiscount(10000, { kind: "fixed", value: 500, currency: "USD" }, "GHS")).toBe(0);
  });
  it("formats GHS", () => expect(formatMoney(150000, "GHS")).toMatch(/1,500/));
});

describe("time zones", () => {
  it("round-trips wall clock in Accra (UTC+0)", () => {
    const d = fromWallClock({ year: 2026, month: 12, day: 5, hour: 18, minute: 0 }, "Africa/Accra");
    expect(d.toISOString()).toBe("2026-12-05T18:00:00.000Z");
  });
  it("handles a non-UTC zone and DST", () => {
    const summer = fromWallClock({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 }, "Europe/London");
    expect(summer.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    const winter = fromWallClock({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, "Europe/London");
    expect(winter.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(toWallClock(summer, "Europe/London").hour).toBe(9);
  });
  it("date keys and local inputs", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateKey(new Date("2026-03-01T23:30:00Z"), "Africa/Lagos")).toBe("2026-03-02");
    const d = fromLocalInput("2026-05-01T10:30", "Africa/Lagos")!;
    expect(d.toISOString()).toBe("2026-05-01T09:30:00.000Z");
    expect(toLocalInput(d, "Africa/Lagos")).toBe("2026-05-01T10:30");
  });
});

describe("availability engine", () => {
  const service = { id: "s1", durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 15, slotIntervalMinutes: 30, minNoticeMinutes: 0, maxAdvanceDays: 60, capacity: 1 };
  const rules = [{ weekday: 1, start: "09:00", end: "12:00" }]; // Monday
  const day = "2030-01-07"; // a Monday
  const now = new Date("2030-01-01T00:00:00Z");

  it("offers slots inside working hours only", () => {
    const slots = computeSlots({ day, tz: "UTC", now, service, rules, exceptions: [], busy: [] });
    expect(slots.map((s) => s.start.toISOString().slice(11, 16))).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
  it("respects existing bookings including buffers", () => {
    const wide = [{ weekday: 1, start: "08:00", end: "13:00" }];
    const b = blockRange(service, new Date("2030-01-07T10:00:00Z")); // occupies 10:00–11:15
    const slots = computeSlots({ day, tz: "UTC", now, service, rules: wide, exceptions: [], busy: [{ ...b, slotGroup: "x", serviceId: "s1" }] });
    const times = slots.map((s) => s.start.toISOString().slice(11, 16));
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("09:00"); // its own 15-min buffer would run into 10:00
    expect(times).not.toContain("11:00"); // inside the 10:00 booking's buffer
    expect(times).toEqual(["08:00", "08:30", "11:30", "12:00"]);
  });
  it("respects minimum notice, max advance and blocked exceptions", () => {
    const late = computeSlots({ day, tz: "UTC", now: new Date("2030-01-07T09:45:00Z"), service: { ...service, minNoticeMinutes: 60 }, rules, exceptions: [], busy: [] });
    expect(late.map((s) => s.start.toISOString().slice(11, 16))).toEqual(["11:00"]);
    expect(computeSlots({ day, tz: "UTC", now, service: { ...service, maxAdvanceDays: 2 }, rules, exceptions: [], busy: [] })).toHaveLength(0);
    const blocked = computeSlots({ day, tz: "UTC", now, service, rules, exceptions: [{ kind: "holiday", start: new Date("2030-01-07T00:00:00Z"), end: new Date("2030-01-08T00:00:00Z") }], busy: [] });
    expect(blocked).toHaveLength(0);
  });
  it("supports group capacity on the same slot", () => {
    const group = { ...service, capacity: 3 };
    const start = new Date("2030-01-07T09:00:00Z");
    const b = blockRange(group, start);
    const busy = [0, 1].map(() => ({ ...b, slotGroup: groupSlotKey("s1", start), serviceId: "s1" }));
    const slots = computeSlots({ day, tz: "UTC", now, service: group, rules, exceptions: [], busy });
    expect(slots.find((s) => s.start.getTime() === start.getTime())?.remaining).toBe(1);
  });
  it("adds extra hours", () => {
    const slots = computeSlots({ day: "2030-01-08", tz: "UTC", now, service, rules, exceptions: [{ kind: "extra_hours", start: new Date("2030-01-08T14:00:00Z"), end: new Date("2030-01-08T15:30:00Z") }], busy: [] });
    expect(slots.map((s) => s.start.toISOString().slice(11, 16))).toEqual(["14:00", "14:30"]);
  });
  it("cutoff rules", () => {
    expect(withinCustomerCutoff(new Date(Date.now() + 48 * 3600_000), 24)).toBe(true);
    expect(withinCustomerCutoff(new Date(Date.now() + 2 * 3600_000), 24)).toBe(false);
  });
});

describe("orders & discounts", () => {
  const items: LineItem[] = [{ itemType: "course", itemId: "c1", description: "Course", quantity: 2, unitPriceMinor: 5000, currency: "GHS" }];
  const d: DiscountCode = { id: "d", code: "X", kind: "percent", value: 10, currency: null, applies_to: "all", target_id: null, max_redemptions: 1, per_customer_limit: 1, redemptions_count: 0, starts_at: null, ends_at: null, active: true };
  it("computes totals server-side", () => {
    expect(computeTotals(items, d)).toEqual({ currency: "GHS", subtotalMinor: 10000, discountMinor: 1000, totalMinor: 9000 });
    expect(() => computeTotals([{ ...items[0], unitPriceMinor: -1 }])).toThrow();
    expect(() => computeTotals([items[0], { ...items[0], currency: "USD" }])).toThrow();
  });
  it("validates discount applicability", () => {
    expect(discountProblem(d, items, new Date(), 0)).toBeNull();
    expect(discountProblem({ ...d, redemptions_count: 1 }, items, new Date(), 0)).toBe("exhausted");
    expect(discountProblem({ ...d, ends_at: new Date(Date.now() - 1000) }, items, new Date(), 0)).toBe("expired");
    expect(discountProblem({ ...d, applies_to: "product" }, items, new Date(), 0)).toBe("not_applicable");
    expect(discountProblem(d, items, new Date(), 1)).toBe("customer_limit");
  });
});

describe("csv", () => {
  it("parses quoted fields", () => expect(parseCsv('name,email\n"Doe, Jane",j@x.com\n')).toEqual([["name", "email"], ["Doe, Jane", "j@x.com"]]));
  it("neutralises formula injection", () => {
    expect(safeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(safeCell("+1 555")).toBe("'+1 555");
    expect(toCsv(["a"], [["@SUM(A1)"]])).toContain("'@SUM(A1)");
  });
});

describe("email templates", () => {
  it("escapes variables in HTML and drops unsafe button links", () => {
    const r = renderEmail({ subject: "Hi {{name}}", body: "Hello {{name}}\n\n[Go]({{url}})" }, { name: "<script>x</script>", url: "javascript:alert(1)" }, { brandName: "B", accent: "#000000", ink: "#000000", paper: "#ffffff", footer: "" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).not.toContain("javascript:");
    expect(r.subject).toBe("Hi <script>x</script>"); // subject is plain text, not HTML
  });
});

describe("paystack adapter", () => {
  const gw = createPaystackGateway("sk_test_abc", (async () => new Response("{}")) as typeof fetch);
  it("verifies HMAC-SHA512 webhook signatures", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "R1", id: 9 } });
    const sig = createHmac("sha512", "sk_test_abc").update(body).digest("hex");
    expect(gw.verifyWebhookSignature(body, sig)).toBe(true);
    expect(gw.verifyWebhookSignature(body + " ", sig)).toBe(false);
    expect(gw.verifyWebhookSignature(body, null)).toBe(false);
    expect(gw.verifyWebhookSignature(body, "deadbeef")).toBe(false);
    expect(gw.parseWebhook(body)).toMatchObject({ type: "charge.success", reference: "R1" });
  });
  it("identifies test vs live mode", () => {
    expect(gw.mode).toBe("test");
    expect(createPaystackGateway("sk_live_x").mode).toBe("live");
  });
});

describe("content & builder validation", () => {
  it("extracts text from rich docs", () => expect(plainText(docFromText("One\n\nTwo"))).toBe("One\n\nTwo"));
  it("rejects unknown blocks and unsafe links", () => {
    expect(pageDataSchema.safeParse({ content: [{ type: "Script", props: {} }] }).success).toBe(false);
    expect(pageDataSchema.safeParse({ content: [{ type: "CallToAction", props: { heading: "x", primaryCta: { label: "a", href: "javascript:alert(1)" } } }] }).success).toBe(false);
    expect(pageDataSchema.safeParse({ content: [{ type: "Hero", props: { headline: "Hi", imageUrl: "data:image/png;base64,AA" } }] }).success).toBe(false);
    const ok = pageDataSchema.safeParse({ content: [{ type: "Hero", props: { headline: "Hello", primaryCta: { label: "Book", href: "/book" } } }] });
    expect(ok.success).toBe(true);
  });
  it("builds parameterised CRM filters", () => {
    const w = contactWhere({ q: "a'; drop table x;--", lifecycle: "lead" });
    expect(w.sql).not.toContain("drop table");
    expect(w.params).toContain("lead");
  });
});

describe("events rules", () => {
  const base = { status: "published" as const, starts_at: new Date(Date.now() + 86400_000), ends_at: new Date(Date.now() + 90000_000), registration_opens_at: null, registration_closes_at: null };
  it("registration windows", () => {
    expect(registrationState(base)).toBe("open");
    expect(registrationState({ ...base, status: "draft" })).toBe("draft");
    expect(registrationState({ ...base, registration_opens_at: new Date(Date.now() + 1000) })).toBe("not_open");
    expect(registrationState({ ...base, registration_closes_at: new Date(Date.now() - 1000) })).toBe("closed");
  });
  it("ticket sales windows (early bird)", () => {
    expect(ticketOnSale({ visibility: "public", sales_start_at: null, sales_end_at: new Date(Date.now() - 1) })).toBe(false);
    expect(ticketOnSale({ visibility: "hidden", sales_start_at: null, sales_end_at: null })).toBe(false);
  });
  it("join window", () => {
    const s = new Date(Date.now() + 3600_000), e = new Date(Date.now() + 7200_000);
    expect(joinWindow(s, e, 30)).toBe("too_early");
    expect(joinWindow(s, e, 90)).toBe("open");
  });
});

describe("file sniffing", () => {
  it("detects by magic bytes, rejects svg and spoofed types", () => {
    expect(sniffFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "a.png")?.mime).toBe("image/png");
    expect(sniffFileType(new TextEncoder().encode("%PDF-1.7"), "a.pdf")?.mime).toBe("application/pdf");
    expect(sniffFileType(new TextEncoder().encode("<svg onload=alert(1)>"), "a.svg")).toBeNull();
    expect(sniffFileType(new TextEncoder().encode("<html>"), "photo.jpg")).toBeNull();
  });
});

describe("assessment scoring", () => {
  const def: AssessmentDefinition = {
    categories: [{ key: "clarity", label: "Brand clarity" }, { key: "visibility", label: "LinkedIn visibility" }],
    questions: [
      { id: "q1", text: "?", options: [{ id: "a", label: "Yes", scores: { clarity: 4 } }, { id: "b", label: "No", scores: { clarity: 0 } }] },
      { id: "q2", text: "?", options: [{ id: "a", label: "Daily", scores: { visibility: 4 } }, { id: "b", label: "Never", scores: { visibility: 0 } }] },
    ],
    bands: [{ min: 0, max: 49, title: "Emerging", recommendation: "r1" }, { min: 50, max: 100, title: "Established", recommendation: "r2" }],
  };
  it("is deterministic and per-category", () => {
    const r = scoreAssessment(def, { q1: "a", q2: "b" });
    expect(r.categories.clarity.percent).toBe(100);
    expect(r.categories.visibility.percent).toBe(0);
    expect(r.overall).toBe(50);
    expect(r.band?.title).toBe("Established");
    expect(() => scoreAssessment(def, { q1: "a" })).toThrow();
  });
});
