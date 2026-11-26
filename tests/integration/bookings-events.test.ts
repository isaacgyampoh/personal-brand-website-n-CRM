import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closePool } from "@/lib/database/pool";
import { createBooking, cancelAppointment, rescheduleAppointment, availableSlots } from "@/features/bookings/application/booking";
import { bookingRepo } from "@/features/bookings/infrastructure/repository";
import { registerForEvent } from "@/features/events/application/registration";
import { cancelEvent } from "@/features/events/application/admin";
import { setPaymentGatewayForTests } from "@/features/payments/application/gateway";
import { fakeGateway, makeEvent, makeService, resetData, tomorrowAt } from "../helpers";

afterAll(() => closePool());
beforeEach(async () => {
  await resetData();
  setPaymentGatewayForTests(undefined);
});

const customer = (n: number) => ({ fullName: `Person ${n}`, email: `p${n}@example.com` });

describe("appointment booking", () => {
  it("books a free appointment and stores UTC timestamps", async () => {
    const s = await makeService();
    const start = tomorrowAt(10);
    const r = await createBooking({ serviceSlug: s.slug, startsAt: start.toISOString(), customer: customer(1) });
    expect(r.kind).toBe("confirmed");
    const a = await db.one<{ status: string; starts_at: Date }>("select status, starts_at from appointments");
    expect(a!.status).toBe("confirmed");
    expect(a!.starts_at.toISOString()).toBe(start.toISOString());
    const n = await db.one<{ n: number }>("select count(*)::int as n from notifications where template_key = 'booking_confirmed'");
    expect(n!.n).toBe(1);
  });

  it("rejects times that are not offered", async () => {
    const s = await makeService();
    const odd = tomorrowAt(10); odd.setUTCMinutes(17);
    await expect(createBooking({ serviceSlug: s.slug, startsAt: odd.toISOString(), customer: customer(1) })).rejects.toThrow(/no longer available/);
  });

  it("prevents concurrent double booking (20 parallel requests, 1 winner)", async () => {
    const s = await makeService();
    const start = tomorrowAt(11).toISOString();
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => createBooking({ serviceSlug: s.slug, startsAt: start, customer: customer(i) })));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const rows = await db.one<{ n: number }>("select count(*)::int as n from appointments where status in ('confirmed','pending_payment')");
    expect(rows!.n).toBe(1);
  });

  it("database exclusion constraint blocks overlaps even if application checks are bypassed", async () => {
    const s = await makeService();
    await createBooking({ serviceSlug: s.slug, startsAt: tomorrowAt(12).toISOString(), customer: customer(1) });
    const c = await db.one<{ id: string }>("select id from contacts limit 1");
    await expect(db.query(
      `insert into appointments (reference, service_id, contact_id, starts_at, ends_at, block_range, slot_group, status)
       values ('BK-RAW', $1, $2, $3, $4, tstzrange($3, $4), 'raw', 'confirmed')`,
      [s.id, c!.id, new Date(tomorrowAt(12).getTime() + 30 * 60_000), new Date(tomorrowAt(12).getTime() + 90 * 60_000)],
    )).rejects.toMatchObject({ code: "23P01" });
  });

  it("group sessions honour capacity", async () => {
    const s = await makeService({ capacity: 3 });
    const start = tomorrowAt(14).toISOString();
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => createBooking({ serviceSlug: s.slug, startsAt: start, customer: customer(i) })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });

  it("cancels and frees the slot; reschedules into a free slot", async () => {
    const s = await makeService();
    const svc = (await bookingRepo.serviceById(s.id))!;
    await createBooking({ serviceSlug: s.slug, startsAt: tomorrowAt(9).toISOString(), customer: customer(1) });
    const a = await db.one<{ id: string }>("select id from appointments");
    const day = tomorrowAt(9).toISOString().slice(0, 10);
    expect((await availableSlots(svc, day)).some((x) => x.start.getTime() === tomorrowAt(9).getTime())).toBe(false);
    await rescheduleAppointment(a!.id, tomorrowAt(15).toISOString(), { kind: "customer" });
    expect((await db.one<{ starts_at: Date }>("select starts_at from appointments"))!.starts_at.toISOString()).toBe(tomorrowAt(15).toISOString());
    expect((await availableSlots(svc, day)).some((x) => x.start.getTime() === tomorrowAt(9).getTime())).toBe(true);
    await cancelAppointment(a!.id, { kind: "customer" }, "test");
    expect((await db.one<{ status: string }>("select status from appointments"))!.status).toBe("cancelled");
    const audit = await db.one<{ n: number }>("select count(*)::int as n from audit_logs where entity_type = 'appointment'");
    expect(audit!.n).toBeGreaterThanOrEqual(2);
  });

  it("paid booking holds the slot pending payment and refuses when payments are unconfigured", async () => {
    const s = await makeService({ price_minor: 50000 });
    setPaymentGatewayForTests(null);
    await expect(createBooking({ serviceSlug: s.slug, startsAt: tomorrowAt(10).toISOString(), customer: customer(1) })).rejects.toThrow(/isn.t available/);
    const fake = fakeGateway();
    setPaymentGatewayForTests(fake.gw);
    const r = await createBooking({ serviceSlug: s.slug, startsAt: tomorrowAt(10).toISOString(), customer: customer(1) });
    expect(r.kind).toBe("payment");
    const a = await db.one<{ status: string; hold_expires_at: Date }>("select status, hold_expires_at from appointments");
    expect(a!.status).toBe("pending_payment");
    expect(a!.hold_expires_at.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("event registration & capacity", () => {
  it("registers for a free event", async () => {
    const e = await makeEvent({ capacity: 5 });
    const r = await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(1), attendees: [customer(1)] });
    expect(r.kind).toBe("confirmed");
    expect((await db.one<{ n: number }>("select count(*)::int as n from event_registrations where status = 'confirmed'"))!.n).toBe(1);
    await expect(registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(1), attendees: [customer(1)] })).rejects.toThrow(/already registered/);
  });

  it("never oversells under concurrency (30 buyers, 5 seats)", async () => {
    const e = await makeEvent({ capacity: 5 });
    const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(i), attendees: [customer(i)] })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect((await db.one<{ n: number }>("select count(*)::int as n from event_registrations where status = 'confirmed'"))!.n).toBe(5);
  });

  it("enforces ticket-level limits and group registrations atomically", async () => {
    const e = await makeEvent({ capacity: 10, ticketCapacity: 3 });
    await expect(registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(1), attendees: [customer(1), customer(2), customer(3), customer(4)] })).rejects.toThrow(/left|sold out/i);
    expect((await db.one<{ n: number }>("select count(*)::int as n from event_registrations"))!.n).toBe(0); // all-or-nothing
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(1), attendees: [customer(1), customer(2), customer(3)] });
    expect((await db.one<{ n: number }>("select count(*)::int as n from event_registrations where status='confirmed'"))!.n).toBe(3);
  });

  it("does not count expired holds against capacity", async () => {
    const e = await makeEvent({ capacity: 1 });
    const c = await db.one<{ id: string }>("insert into contacts (email) values ('hold@example.com') returning id");
    await db.query(
      `insert into event_registrations (reference, event_id, ticket_type_id, contact_id, attendee_email, status, hold_expires_at)
       values ('REG-OLD', $1, $2, $3, 'hold@example.com', 'reserved', now() - interval '1 minute')`,
      [e.id, e.ticketId, c!.id],
    );
    const r = await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(1), attendees: [customer(1)] });
    expect(r.kind).toBe("confirmed");
  });

  it("cancelling an event cancels registrations and notifies attendees", async () => {
    const e = await makeEvent({ capacity: 5 });
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: customer(1), attendees: [customer(1)] });
    const owner = await db.one<{ id: string }>("insert into users (email, role) values ('o@example.com','owner') on conflict (email) do update set role='owner' returning id");
    const r = await cancelEvent(e.id, "Speaker unwell", owner!.id);
    expect(r.notified).toBe(1);
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("cancelled");
    expect((await db.one<{ n: number }>("select count(*)::int as n from notifications where template_key = 'event_cancelled'"))!.n).toBe(1);
  });
});
