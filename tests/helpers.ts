import { createHmac } from "node:crypto";
import { db } from "@/lib/database/pool";
import type { PaymentGateway, VerifiedTransaction } from "@/features/payments/domain/gateway";

export const SECRET = "sk_test_fake_secret_for_tests";

/**
 * Test double for the payment provider. It records initialisations and lets a
 * test decide what /verify returns — used ONLY in tests (never at runtime).
 */
export function fakeGateway() {
  const transactions = new Map<string, Partial<VerifiedTransaction>>();
  const refunds: { reference: string; amountMinor: number }[] = [];
  const gw: PaymentGateway = {
    name: "paystack",
    mode: "test",
    async initialize({ reference }) {
      transactions.set(reference, { status: "pending" });
      return { authorizationUrl: `https://checkout.example/${reference}`, accessCode: "x" };
    },
    async verify(reference) {
      const t = transactions.get(reference) ?? { status: "unknown" };
      const payment = await db.one<{ amount_minor: number; currency: string }>("select amount_minor, currency from payments where provider_reference = $1", [reference]);
      return {
        reference, status: "pending", amountMinor: payment?.amount_minor ?? 0, currency: payment?.currency ?? "GHS",
        channel: "mobile_money", providerTransactionId: "1", gatewayResponse: "Approved", paidAt: new Date(), ...t,
      } as VerifiedTransaction;
    },
    verifyWebhookSignature(raw, sig) {
      const expected = createHmac("sha512", SECRET).update(raw).digest("hex");
      return sig === expected;
    },
    parseWebhook(raw) {
      const b = JSON.parse(raw);
      return { eventKey: `${b.event}:${b.data.id}:${b.data.status ?? ""}`, type: b.event, reference: b.data.reference ?? null, refundId: null, payload: b };
    },
    async refund(input) {
      refunds.push({ reference: input.reference, amountMinor: input.amountMinor });
      return { providerRefundId: `rf_${refunds.length}`, status: "pending" };
    },
    async fetchRefund() {
      return { status: "processed", raw: {} };
    },
  };
  return {
    gw,
    refunds,
    succeed: (ref: string, patch: Partial<VerifiedTransaction> = {}) => transactions.set(ref, { status: "success", ...patch }),
    fail: (ref: string) => transactions.set(ref, { status: "failed" }),
    sign: (raw: string) => createHmac("sha512", SECRET).update(raw).digest("hex"),
  };
}

export async function resetData() {
  await db.query(`
    truncate table appointments, event_registrations, event_waitlist, event_feedback, session_attendance, enrolments, lesson_progress,
      quiz_attempts, certificates, downloads, entitlements, discount_redemptions, order_items, invoices, refunds, payments, payment_events,
      crm_activities, contact_tags, tasks, form_submissions, subscribers, subscriber_lists, notifications, jobs, campaign_recipients,
      rate_limits, assessment_responses
    restart identity cascade`);
  // Immutable tables: bypass triggers only inside the test database.
  await db.query("alter table financial_ledger disable trigger financial_ledger_immutable");
  await db.query("alter table audit_logs disable trigger audit_logs_immutable");
  await db.query("alter table invoices disable trigger invoices_immutable");
  await db.query("truncate financial_ledger, audit_logs restart identity cascade");
  await db.query("delete from invoices");
  await db.query("alter table financial_ledger enable trigger financial_ledger_immutable");
  await db.query("alter table audit_logs enable trigger audit_logs_immutable");
  await db.query("alter table invoices enable trigger invoices_immutable");
  await db.query("delete from orders");
  await db.query("delete from contacts");
  await db.query("delete from discount_codes");
  await db.query("delete from ticket_types");
  await db.query("delete from events");
  await db.query("delete from services");
  await db.query("delete from availability_exceptions");
}

/** A service bookable every day 08:00–20:00 with no notice period, for deterministic tests. */
export async function makeService(overrides: Partial<{ slug: string; price_minor: number; capacity: number; duration: number }> = {}) {
  const slug = overrides.slug ?? `svc-${Math.random().toString(36).slice(2, 8)}`;
  const s = await db.one<{ id: string; slug: string }>(
    `insert into services (slug, name, price_minor, duration_minutes, buffer_after_minutes, slot_interval_minutes, min_notice_minutes, capacity)
     values ($1, $1, $2, $3, 0, 30, 0, $4) returning id, slug`,
    [slug, overrides.price_minor ?? 0, overrides.duration ?? 60, overrides.capacity ?? 1],
  );
  for (let d = 0; d < 7; d++) {
    await db.query("insert into availability_rules (service_id, weekday, start_time, end_time) values ($1,$2,'08:00','20:00')", [s!.id, d]);
  }
  return s!;
}

export function tomorrowAt(hourUtc: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

export async function makeEvent(opts: { capacity?: number | null; price?: number; ticketCapacity?: number | null } = {}) {
  const slug = `ev-${Math.random().toString(36).slice(2, 8)}`;
  const e = await db.one<{ id: string; slug: string }>(
    `insert into events (slug, title, starts_at, ends_at, capacity, status, published_at) values ($1, $1, now() + interval '5 days', now() + interval '5 days 2 hours', $2, 'published', now()) returning id, slug`,
    [slug, opts.capacity === undefined ? 5 : opts.capacity],
  );
  const t = await db.one<{ id: string }>(
    "insert into ticket_types (event_id, name, price_minor, capacity, max_per_order) values ($1, 'Standard', $2, $3, 10) returning id",
    [e!.id, opts.price ?? 0, opts.ticketCapacity ?? null],
  );
  return { ...e!, ticketId: t!.id };
}
