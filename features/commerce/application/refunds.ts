import "server-only";
import { UserError } from "@/lib/errors";
import { db, tx, type Db } from "@/lib/database/pool";
import { randomToken } from "@/lib/security/crypto";
import { enqueue } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";
import { logActivity } from "@/features/crm/application/contacts";
import { alertAdmin } from "@/features/notifications/application/send";
import { paymentGateway } from "@/features/payments/application/gateway";
import { fulfillers, type OrderItemRow } from "./fulfillers";
import type { OrderRow } from "./checkout";

export class RefundError extends UserError {}

/**
 * Creates a refund request. Online payments are refunded through the
 * provider by a background job; manual payments are recorded immediately
 * (the money is returned offline by the business).
 */
export async function requestRefund(input: { orderId: string; amountMinor: number; reason: string; actorId: string | null; idempotencyKey?: string }) {
  return tx(async (t) => {
    const order = await t.one<OrderRow>("select * from orders where id = $1 for update", [input.orderId]);
    if (!order) throw new RefundError("Order not found.");
    if (!["paid", "partially_refunded", "needs_attention"].includes(order.status)) throw new RefundError(`Order is ${order.status}; nothing to refund.`);
    const pending = await t.one<{ n: number }>(
      "select coalesce(sum(amount_minor),0)::bigint as n from refunds where order_id = $1 and status in ('pending','processing')",
      [order.id],
    );
    const refundable = order.total_minor - order.refunded_minor - (pending?.n ?? 0);
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > refundable) {
      throw new RefundError(`Refund amount must be between 1 and ${refundable} (minor units).`);
    }
    const payment = await t.one<{ id: string; provider: string; provider_reference: string }>(
      "select id, provider, provider_reference from payments where order_id = $1 and status = 'success' order by verified_at limit 1",
      [order.id],
    );
    if (!payment) throw new RefundError("No successful payment found for this order.");
    const refund = await t.one<{ id: string }>(
      `insert into refunds (order_id, payment_id, amount_minor, currency, reason, status, requested_by, idempotency_key)
       values ($1,$2,$3,$4,$5,'pending',$6,$7) on conflict (idempotency_key) do nothing returning id`,
      [order.id, payment.id, input.amountMinor, order.currency, input.reason.slice(0, 500), input.actorId, input.idempotencyKey ?? randomToken(16)],
    );
    if (!refund) return null;
    await audit({ actorId: input.actorId, action: "refund.request", entityType: "order", entityId: order.id, data: { amount: input.amountMinor, reason: input.reason } }, t);
    if (payment.provider === "manual") {
      await markRefundProcessed(t, refund.id, null);
    } else {
      await enqueue("payment.refund", { refundId: refund.id }, { idempotencyKey: `refund:${refund.id}`, maxAttempts: 6 }, t);
    }
    return refund.id;
  });
}

/** Job handler: submits a pending refund to the provider. */
export async function submitRefund(refundId: string): Promise<void> {
  const r = await db.one<{ id: string; status: string; amount_minor: number; reason: string; provider_reference: string }>(
    `select r.id, r.status, r.amount_minor, r.reason, p.provider_reference
       from refunds r join payments p on p.id = r.payment_id where r.id = $1`,
    [refundId],
  );
  if (!r || r.status !== "pending") return;
  const gateway = paymentGateway();
  if (!gateway) throw new Error("Payments not configured; refund cannot be submitted.");
  const result = await gateway.refund({ reference: r.provider_reference, amountMinor: r.amount_minor, note: r.reason });
  await db.query(`update refunds set status = 'processing', provider_refund_id = $2 where id = $1 and status = 'pending'`, [r.id, result.providerRefundId]);
  if (result.status === "processed") await tx((t) => markRefundProcessed(t, r.id, result.providerRefundId));
}

/** Finalises a refund exactly once: ledger entry, order totals, access revocation. */
export async function markRefundProcessed(t: Db, refundId: string, providerRefundId: string | null): Promise<void> {
  const r = await t.one<{ id: string; order_id: string; payment_id: string; amount_minor: number; currency: string; status: string; requested_by: string | null }>(
    "select * from refunds where id = $1 for update",
    [refundId],
  );
  if (!r || r.status === "processed") return;
  await t.query(`update refunds set status = 'processed', processed_at = now(), provider_refund_id = coalesce($2, provider_refund_id) where id = $1`, [r.id, providerRefundId]);
  await t.query(
    `insert into financial_ledger (order_id, payment_id, refund_id, kind, amount_minor, currency, memo, created_by)
     values ($1,$2,$3,'refund',$4,$5,'Refund',$6) on conflict (refund_id) where kind = 'refund' do nothing`,
    [r.order_id, r.payment_id, r.id, -r.amount_minor, r.currency, r.requested_by],
  );
  const order = await t.one<OrderRow>(
    `update orders set refunded_minor = refunded_minor + $2,
        status = case when refunded_minor + $2 >= total_minor then 'refunded' else 'partially_refunded' end
      where id = $1 returning *`,
    [r.order_id, r.amount_minor],
  );
  if (!order) return;
  await t.query(`update contacts set total_spent_minor = greatest(total_spent_minor - $2, 0) where id = $1`, [order.contact_id, r.amount_minor]);
  const full = order.status === "refunded";
  if (full) {
    const items = await t.query<OrderItemRow>("select * from order_items where order_id = $1", [order.id]);
    const byType = new Map<string, OrderItemRow[]>();
    for (const i of items) byType.set(i.item_type, [...(byType.get(i.item_type) ?? []), i]);
    for (const [type, list] of byType) await fulfillers[type as keyof typeof fulfillers].onRefunded(t, order, list);
  }
  await logActivity(t, order.contact_id, "refund", `Refund processed for ${order.reference}`, { data: { amount: r.amount_minor, full } });
}

export async function markRefundFailed(refundId: string, reason: string): Promise<void> {
  const r = await db.one<{ order_id: string }>(
    `update refunds set status = 'failed', failure_reason = $2 where id = $1 and status in ('pending','processing') returning order_id`,
    [refundId, reason.slice(0, 500)],
  );
  if (r) await alertAdmin("Refund failed", `A refund could not be processed: ${reason}`, `refund-failed:${refundId}`);
}

/** Reconciles refunds still processing with the provider. */
export async function pollProcessingRefunds(): Promise<void> {
  const gateway = paymentGateway();
  if (!gateway) return;
  const rows = await db.query<{ id: string; provider_refund_id: string }>(
    `select id, provider_refund_id from refunds where status = 'processing' and provider_refund_id is not null and created_at > now() - interval '30 days' limit 50`,
  );
  for (const r of rows) {
    const res = await gateway.fetchRefund(r.provider_refund_id);
    if (res.status === "processed") await tx((t) => markRefundProcessed(t, r.id, r.provider_refund_id));
    else if (res.status === "failed") await markRefundFailed(r.id, "Provider reported failure");
  }
}
