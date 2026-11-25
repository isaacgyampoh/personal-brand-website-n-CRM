import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, tx, closePool } from "@/lib/database/pool";
import { registerForEvent } from "@/features/events/application/registration";
import { purchaseCatalogItem } from "@/features/commerce/application/purchase";
import { expireStaleOrders, recordManualPayment, verifyAndApply } from "@/features/commerce/application/fulfilment";
import { requestRefund, submitRefund, markRefundProcessed } from "@/features/commerce/application/refunds";
import { receiveWebhook, processWebhookEvent } from "@/features/payments/application/webhooks";
import { setPaymentGatewayForTests } from "@/features/payments/application/gateway";
import { reconciliationReport } from "@/features/commerce/application/reconciliation";
import { hasEntitlement } from "@/features/commerce/application/entitlements";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { fakeGateway, makeEvent, resetData } from "../helpers";

afterAll(() => closePool());
let fake: ReturnType<typeof fakeGateway>;
beforeEach(async () => {
  await resetData();
  fake = fakeGateway();
  setPaymentGatewayForTests(fake.gw);
});

async function paidEvent(price = 25000, capacity = 5) {
  const e = await makeEvent({ capacity, price });
  const r = await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: { fullName: "Ama", email: "ama@example.com" }, attendees: [{ fullName: "Ama", email: "ama@example.com" }] });
  if (r.kind !== "payment") throw new Error("expected payment");
  const p = await db.one<{ provider_reference: string; order_id: string }>("select provider_reference, order_id from payments order by created_at desc limit 1");
  return { e, ref: p!.provider_reference, orderId: p!.order_id };
}

const webhookBody = (ref: string, id = 1) => JSON.stringify({ event: "charge.success", data: { id, reference: ref, status: "success" } });

describe("payment verification & fulfilment", () => {
  it("reserves seat, then confirms only after independent verification", async () => {
    const { ref, orderId } = await paidEvent();
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("reserved");
    // Reaching the success page / verify while provider says pending must NOT mark paid.
    expect((await verifyAndApply(ref)).status).toBe("pending");
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("pending");
    fake.succeed(ref);
    expect((await verifyAndApply(ref)).status).toBe("paid");
    const o = await db.one<{ status: string; fulfilled_at: Date | null }>("select status, fulfilled_at from orders where id = $1", [orderId]);
    expect(o!.status).toBe("paid");
    expect(o!.fulfilled_at).not.toBeNull();
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("confirmed");
    expect((await db.one<{ n: number }>("select count(*)::int as n from invoices"))!.n).toBe(1);
    expect((await db.one<{ s: number }>("select sum(amount_minor)::int as s from financial_ledger"))!.s).toBe(25000);
  });

  it("rejects a tampered amount (verified amount ≠ order total)", async () => {
    const { ref, orderId } = await paidEvent();
    fake.succeed(ref, { amountMinor: 100 });
    expect((await verifyAndApply(ref)).status).toBe("mismatch");
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("needs_attention");
    expect((await db.one<{ n: number }>("select count(*)::int as n from financial_ledger"))!.n).toBe(0);
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("reserved");
  });

  it("rejects wrong currency", async () => {
    const { ref } = await paidEvent();
    fake.succeed(ref, { currency: "USD" });
    expect((await verifyAndApply(ref)).status).toBe("mismatch");
  });

  it("handles failed payments without granting access", async () => {
    const { ref, orderId } = await paidEvent();
    fake.fail(ref);
    expect((await verifyAndApply(ref)).status).toBe("failed");
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("failed");
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("reserved");
  });
});

describe("webhooks", () => {
  it("rejects invalid signatures and stores nothing", async () => {
    const { ref } = await paidEvent();
    const r = await receiveWebhook(webhookBody(ref), "0".repeat(128));
    expect(r.status).toBe(401);
    expect((await db.one<{ n: number }>("select count(*)::int as n from payment_events"))!.n).toBe(0);
  });

  it("processes a valid webhook once, even when delivered repeatedly", async () => {
    const { ref, orderId } = await paidEvent();
    fake.succeed(ref);
    const body = webhookBody(ref);
    for (let i = 0; i < 3; i++) expect((await receiveWebhook(body, fake.sign(body))).status).toBe(200);
    expect((await db.one<{ n: number }>("select count(*)::int as n from payment_events"))!.n).toBe(1);
    const ev = await db.one<{ id: string }>("select id from payment_events");
    await Promise.all([processWebhookEvent(ev!.id), processWebhookEvent(ev!.id), verifyAndApply(ref)]);
    expect((await db.one<{ n: number }>("select count(*)::int as n from financial_ledger"))!.n).toBe(1);
    expect((await db.one<{ n: number }>("select count(*)::int as n from invoices"))!.n).toBe(1);
    expect((await db.one<{ n: number }>("select count(*)::int as n from notifications where template_key = 'payment_receipt'"))!.n).toBe(1);
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("paid");
  });

  it("a webhook arriving before the provider settles is retried, not applied", async () => {
    const { ref } = await paidEvent();
    const body = webhookBody(ref, 2);
    await receiveWebhook(body, fake.sign(body));
    const ev = await db.one<{ id: string }>("select id from payment_events");
    await expect(processWebhookEvent(ev!.id)).rejects.toThrow(/pending/);
    fake.succeed(ref);
    await processWebhookEvent(ev!.id);
    expect((await db.one<{ processed_at: Date | null }>("select processed_at from payment_events"))!.processed_at).not.toBeNull();
  });
});

describe("delayed payments after reservation expiry", () => {
  it("confirms a late payment when the seat is still available", async () => {
    const { ref, orderId } = await paidEvent(25000, 5);
    await db.query("update orders set expires_at = now() - interval '1 minute' where id = $1", [orderId]);
    await db.query("update event_registrations set hold_expires_at = now() - interval '1 minute'");
    expect(await expireStaleOrders()).toBe(1);
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("expired");
    fake.succeed(ref);
    expect((await verifyAndApply(ref)).status).toBe("paid");
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("confirmed");
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("paid");
  });

  it("flags a late payment for attention when the event sold out meanwhile", async () => {
    const { e, ref, orderId } = await paidEvent(25000, 1);
    await db.query("update orders set expires_at = now() - interval '1 minute' where id = $1", [orderId]);
    await db.query("update event_registrations set hold_expires_at = now() - interval '1 minute'");
    await expireStaleOrders();
    // someone else takes the only seat (free comp)
    const c = await db.one<{ id: string }>("insert into contacts (email) values ('x@example.com') returning id");
    await db.query(`insert into event_registrations (reference, event_id, ticket_type_id, contact_id, attendee_email, status, source) values ('REG-COMP', $1, $2, $3, 'x@example.com', 'confirmed', 'complimentary')`, [e.id, e.ticketId, c!.id]);
    fake.succeed(ref);
    await verifyAndApply(ref);
    const o = await db.one<{ status: string; attention_reason: string }>("select status, attention_reason from orders where id = $1", [orderId]);
    expect(o!.status).toBe("needs_attention");
    expect(o!.attention_reason).toMatch(/sold out/i);
    expect((await db.one<{ n: number }>("select count(*)::int as n from event_registrations where status = 'confirmed'"))!.n).toBe(1);
    expect((await db.one<{ n: number }>("select count(*)::int as n from financial_ledger"))!.n).toBe(1); // money recorded
    const report = await reconciliationReport();
    expect(report.issues.some((i) => i.kind === "needs_attention")).toBe(true);
  });
});

describe("refunds", () => {
  it("full refund: ledger, order status, access revoked, idempotent", async () => {
    const { ref, orderId } = await paidEvent();
    fake.succeed(ref);
    await verifyAndApply(ref);
    const refundId = await requestRefund({ orderId, amountMinor: 25000, reason: "Customer request", actorId: null, idempotencyKey: "r1" });
    expect(await requestRefund({ orderId, amountMinor: 1, reason: "dup", actorId: null, idempotencyKey: "r1" })).toBeNull();
    await expect(requestRefund({ orderId, amountMinor: 1, reason: "over", actorId: null })).rejects.toThrow(/between/);
    await submitRefund(refundId!);
    expect(fake.refunds).toHaveLength(1);
    await tx((t) => markRefundProcessed(t, refundId!, "rf_1"));
    await tx((t) => markRefundProcessed(t, refundId!, "rf_1"));
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("refunded");
    expect((await db.one<{ s: number }>("select sum(amount_minor)::int as s from financial_ledger"))!.s).toBe(0);
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("refunded");
    expect((await reconciliationReport()).issues.filter((i) => i.severity === "high")).toHaveLength(0);
  });
});

describe("financial integrity", () => {
  it("ledger and audit logs are immutable", async () => {
    const { ref } = await paidEvent();
    fake.succeed(ref);
    await verifyAndApply(ref);
    await expect(db.query("update financial_ledger set amount_minor = 1")).rejects.toThrow(/IMMUTABLE/);
    await expect(db.query("delete from financial_ledger")).rejects.toThrow(/IMMUTABLE/);
    await db.query("insert into audit_logs (action, entity_type) values ('test', 'test')");
    await expect(db.query("update audit_logs set action = 'x'")).rejects.toThrow(/IMMUTABLE/);
    await expect(db.query("delete from audit_logs")).rejects.toThrow(/IMMUTABLE/);
    await expect(db.query("delete from invoices")).rejects.toThrow(/IMMUTABLE/);
  });

  it("order status transitions are enforced by the database", async () => {
    const { ref, orderId } = await paidEvent();
    fake.succeed(ref);
    await verifyAndApply(ref);
    await expect(db.query("update orders set status = 'pending' where id = $1", [orderId])).rejects.toThrow(/INVALID_ORDER_TRANSITION/);
  });

  it("manual payment records an audited ledger entry and fulfils", async () => {
    const { orderId } = await paidEvent();
    const owner = await db.one<{ id: string }>("insert into users (email, role) values ('fin@example.com','finance_manager') returning id");
    await expect(recordManualPayment({ orderId, amountMinor: 100, note: "x", actorId: owner!.id, method: "cash" })).rejects.toThrow(/equal the order total/);
    await recordManualPayment({ orderId, amountMinor: 25000, note: "Bank ref 123", actorId: owner!.id, method: "bank_transfer" });
    expect((await db.one<{ status: string }>("select status from event_registrations"))!.status).toBe("confirmed");
    expect((await db.one<{ n: number }>("select count(*)::int as n from audit_logs where action = 'payment.manual_record'"))!.n).toBe(1);
  });
});

describe("courses & products: entitlements", () => {
  it("free product grants an entitlement only to the verified account owner", async () => {
    const file = await db.one<{ id: string }>(`insert into media_assets (storage_key, visibility, filename, mime_type, size_bytes, sha256) values ('k/test.pdf','private','t.pdf','application/pdf',10,'abc') returning id`);
    await db.query(`insert into products (slug, title, price_minor, status, file_media_id, is_lead_magnet) values ('free-guide','Free guide',0,'published',$1,true) on conflict (slug) do nothing`, [file!.id]);
    const r = await purchaseCatalogItem({ type: "product", slug: "free-guide", buyer: { fullName: "Kofi", email: "kofi@example.com" } });
    expect(r.kind).toBe("fulfilled");
    const product = await db.one<{ id: string }>("select id from products where slug = 'free-guide'");
    const unverified = await db.one<{ id: string }>("insert into users (email) values ('kofi@example.com') returning id");
    await attachVerifiedUser(unverified!.id);
    expect(await hasEntitlement(unverified!.id, "product", product!.id)).toBeNull(); // unverified email: no access
    await db.query("update users set email_verified_at = now() where id = $1", [unverified!.id]);
    await attachVerifiedUser(unverified!.id);
    expect(await hasEntitlement(unverified!.id, "product", product!.id)).not.toBeNull();
    const stranger = await db.one<{ id: string }>("insert into users (email, email_verified_at) values ('other@example.com', now()) returning id");
    expect(await hasEntitlement(stranger!.id, "product", product!.id)).toBeNull();
  });
});
