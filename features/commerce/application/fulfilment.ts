import "server-only";
import { db, tx, type Db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { formatMoney } from "@/lib/money";
import { logActivity } from "@/features/crm/application/contacts";
import { alertAdmin, enqueueEmail } from "@/features/notifications/application/send";
import { paymentGateway } from "@/features/payments/application/gateway";
import type { ProviderName, VerifiedTransaction } from "@/features/payments/domain/gateway";
import { fulfillers, type OrderItemRow } from "./fulfillers";
import { issueReceipt } from "./receipts";
import type { OrderRow } from "./checkout";

type PaymentRow = {
  id: string; order_id: string; provider: string; provider_reference: string; amount_minor: number;
  currency: string; status: string;
};

async function itemsByType(t: Db, orderId: string): Promise<Map<string, OrderItemRow[]>> {
  const items = await t.query<OrderItemRow>("select * from order_items where order_id = $1", [orderId]);
  const map = new Map<string, OrderItemRow[]>();
  for (const i of items) map.set(i.item_type, [...(map.get(i.item_type) ?? []), i]);
  return map;
}

/**
 * Fulfils a PAID order exactly once. The `fulfilled_at is null` claim makes
 * duplicate webhooks / callbacks / reconciliation runs harmless.
 */
export async function fulfilOrder(t: Db, orderId: string, ctx: { source: "payment" | "free" | "manual"; late?: boolean }) {
  const order = await t.one<OrderRow>(
    `update orders set fulfilled_at = now() where id = $1 and fulfilled_at is null and status = 'paid' returning *`,
    [orderId],
  );
  if (!order) return { fulfilled: false as const };

  const problems: string[] = [];
  for (const [type, items] of await itemsByType(t, orderId)) {
    const handler = fulfillers[type as keyof typeof fulfillers];
    await t.query("savepoint fulfil_item");
    try {
      const result = await handler.onPaid(t, { order, items, late: Boolean(ctx.late) });
      if (result.ok) await t.query("release savepoint fulfil_item");
      else {
        await t.query("rollback to savepoint fulfil_item");
        problems.push(result.reason);
      }
    } catch (error) {
      await t.query("rollback to savepoint fulfil_item");
      problems.push(`${type}: ${(error as Error).message}`);
    }
  }

  if (order.total_minor > 0) {
    await t.query(
      `update contacts set lifecycle = 'customer', total_spent_minor = total_spent_minor + $2 where id = $1`,
      [order.contact_id, order.total_minor],
    );
  } else {
    await t.query(`update contacts set lifecycle = case when lifecycle = 'lead' then 'lead' else lifecycle end where id = $1`, [order.contact_id]);
  }
  await logActivity(t, order.contact_id, order.total_minor > 0 ? "payment" : "purchase",
    order.total_minor > 0 ? `Paid ${formatMoney(order.total_minor, order.currency)} (${order.reference})` : `Free registration (${order.reference})`,
    { data: { orderId: order.id, source: ctx.source } });

  if (order.total_minor > 0) {
    const receipt = await issueReceipt(t, order.id);
    if (receipt) {
      await enqueueEmail({
        to: order.email,
        template: "payment_receipt",
        data: {
          name: order.customer_name || "there",
          total: formatMoney(order.total_minor, order.currency),
          receiptNumber: receipt.number,
          reference: order.reference,
          items: receipt.itemsSummary,
          receiptUrl: `${env().APP_URL}/portal/orders/${order.reference}`,
        },
        idempotencyKey: `receipt:${order.id}`,
        related: { type: "order", id: order.id },
        attachments: [{ kind: "receipt", orderId: order.id }],
      }, t);
    }
  }

  if (problems.length) {
    await t.query(
      `update orders set status = 'needs_attention', attention_reason = $2 where id = $1`,
      [order.id, problems.join("; ").slice(0, 1000)],
    );
    await alertAdmin(
      `Order ${order.reference} needs attention`,
      `Payment was received but fulfilment could not complete: ${problems.join("; ")}. Review the order and refund or rebook the customer.`,
      `order-attention:${order.id}`,
      t,
    );
  }
  return { fulfilled: true as const, problems };
}

export class PaymentMismatchError extends Error {}

/** Applies an independently verified successful transaction. Idempotent. */
export async function applyVerifiedPayment(t: Db, payment: PaymentRow, verified: VerifiedTransaction) {
  const order = await t.one<OrderRow>("select * from orders where id = $1 for update", [payment.order_id]);
  if (!order) throw new Error("Order missing for payment");

  const mismatch =
    verified.reference !== payment.provider_reference ? "reference" :
    verified.currency !== payment.currency.toUpperCase() ? "currency" :
    verified.amountMinor !== payment.amount_minor ? "amount" :
    payment.amount_minor !== order.total_minor ? "order total" : null;
  if (mismatch) {
    await t.query(
      `update payments set status = 'failed', gateway_response = $2, verified_at = now() where id = $1`,
      [payment.id, `Verification mismatch on ${mismatch}: expected ${payment.amount_minor} ${payment.currency}, got ${verified.amountMinor} ${verified.currency}`],
    );
    if (!["paid", "refunded", "partially_refunded", "needs_attention"].includes(order.status)) {
      await t.query(`update orders set status = 'needs_attention', attention_reason = $2 where id = $1`, [order.id, `Payment ${mismatch} mismatch`]);
    }
    await alertAdmin(`Payment mismatch on ${order.reference}`, `Verified ${mismatch} did not match. No access was granted.`, `mismatch:${payment.id}`, t);
    return { status: "mismatch" as const };
  }

  await t.query(
    `update payments set status = 'success', verified_at = now(), channel = $2, provider_transaction_id = $3, gateway_response = $4
     where id = $1`,
    [payment.id, verified.channel, verified.providerTransactionId, verified.gatewayResponse],
  );
  await t.query(
    `insert into financial_ledger (order_id, payment_id, kind, amount_minor, currency, memo)
     values ($1, $2, 'payment', $3, $4, $5)
     on conflict (payment_id) where kind in ('payment','manual_payment') do nothing`,
    [order.id, payment.id, verified.amountMinor, verified.currency, `${payment.provider === "hubtel" ? "Hubtel" : "Paystack"} ${payment.provider_reference}`],
  );

  if (["pending", "failed", "expired"].includes(order.status)) {
    const late = order.status === "expired" || (order.expires_at !== null && order.expires_at < new Date());
    await t.query(`update orders set status = 'paid', paid_at = coalesce($2, now()) where id = $1`, [order.id, verified.paidAt]);
    await fulfilOrder(t, order.id, { source: "payment", late });
    return { status: "paid" as const };
  }
  if (order.status === "cancelled") {
    await t.query(`update orders set status = 'needs_attention', attention_reason = 'Payment received for a cancelled order' where id = $1`, [order.id]);
    await alertAdmin(`Payment for cancelled order ${order.reference}`, "Refund the customer or reinstate the order.", `cancelled-paid:${payment.id}`, t);
    return { status: "needs_attention" as const };
  }
  // Order already paid by a different payment attempt: a genuine double charge.
  const other = await t.one("select 1 from payments where order_id = $1 and status = 'success' and id <> $2", [order.id, payment.id]);
  if (other) {
    await alertAdmin(`Duplicate payment on ${order.reference}`, "Two successful payments were received for one order. Refund one of them.", `dup:${payment.id}`, t);
  }
  return { status: order.status as "paid" };
}

/**
 * Independently verifies a transaction with the provider and applies the
 * outcome. Used by the callback page, webhooks and reconciliation.
 */
export async function verifyAndApply(reference: string): Promise<{ status: string; orderReference: string | null }> {
  const payment = await db.one<PaymentRow>("select * from payments where provider in ('paystack','hubtel') and provider_reference = $1", [reference]);
  if (!payment) return { status: "unknown", orderReference: null };
  const orderRef = await db.one<{ reference: string }>("select reference from orders where id = $1", [payment.order_id]);
  if (payment.status === "success") return { status: "paid", orderReference: orderRef?.reference ?? null };

  // Always verify with the provider that created the payment, never another one.
  const gateway = await paymentGateway(payment.provider as ProviderName, "verify");
  if (!gateway || gateway.name !== payment.provider) return { status: "unconfigured", orderReference: orderRef?.reference ?? null };
  const verified = await gateway.verify(reference);

  const outcome = await tx(async (t) => {
    const locked = await t.one<PaymentRow>("select * from payments where id = $1 for update", [payment.id]);
    if (!locked) return "unknown";
    if (locked.status === "success") return "paid";
    if (verified.status === "success") return (await applyVerifiedPayment(t, locked, verified)).status;
    if (["failed", "abandoned", "reversed"].includes(verified.status)) {
      await t.query(`update payments set status = $2, gateway_response = $3, verified_at = now() where id = $1`, [
        locked.id, verified.status === "reversed" ? "reversed" : verified.status, verified.gatewayResponse,
      ]);
      await t.query(`update orders set status = 'failed' where id = $1 and status = 'pending'`, [locked.order_id]);
      return "failed";
    }
    return "pending";
  });
  return { status: outcome, orderReference: orderRef?.reference ?? null };
}

/** Records an offline payment (cash, bank transfer, MoMo to business line). */
export async function recordManualPayment(input: { orderId: string; amountMinor: number; note: string; actorId: string; method: string }) {
  return tx(async (t) => {
    const order = await t.one<OrderRow>("select * from orders where id = $1 for update", [input.orderId]);
    if (!order) throw new Error("Order not found");
    if (!["pending", "failed", "expired", "needs_attention"].includes(order.status)) throw new Error(`Order is ${order.status}`);
    if (input.amountMinor !== order.total_minor) throw new Error("Manual payment must equal the order total.");
    const payment = await t.one<{ id: string }>(
      `insert into payments (order_id, provider, provider_reference, amount_minor, currency, status, channel, recorded_by, notes, verified_at)
       values ($1, 'manual', $2, $3, $4, 'success', $5, $6, $7, now()) returning id`,
      [order.id, `${order.reference}-M${Date.now()}`, input.amountMinor, order.currency, input.method, input.actorId, input.note],
    );
    await t.query(
      `insert into financial_ledger (order_id, payment_id, kind, amount_minor, currency, memo, created_by)
       values ($1, $2, 'manual_payment', $3, $4, $5, $6)`,
      [order.id, payment!.id, input.amountMinor, order.currency, `Manual (${input.method}): ${input.note}`.slice(0, 300), input.actorId],
    );
    await t.query(`update orders set status = 'paid', paid_at = now() where id = $1`, [order.id]);
    await t.query(
      `insert into audit_logs (actor_id, action, entity_type, entity_id, data) values ($1, 'payment.manual_record', 'order', $2, $3)`,
      [input.actorId, order.id, JSON.stringify({ amount: input.amountMinor, method: input.method, note: input.note })],
    );
    return fulfilOrder(t, order.id, { source: "manual", late: order.status === "expired" });
  });
}

/** Expires unpaid orders past their hold and releases their reservations. */
export async function expireStaleOrders(limit = 100): Promise<number> {
  const due = await db.query<{ id: string }>(
    `select id from orders where status in ('pending','failed') and expires_at < now() order by expires_at limit $1`,
    [limit],
  );
  let count = 0;
  for (const { id } of due) {
    await tx(async (t) => {
      const order = await t.one<OrderRow>("select * from orders where id = $1 for update", [id]);
      if (!order || !["pending", "failed"].includes(order.status) || !order.expires_at || order.expires_at > new Date()) return;
      await t.query("update orders set status = 'expired' where id = $1", [id]);
      for (const [type, items] of await itemsByType(t, id)) {
        await fulfillers[type as keyof typeof fulfillers].onReleased(t, order, items);
      }
      const red = await t.one<{ discount_code_id: string }>("delete from discount_redemptions where order_id = $1 returning discount_code_id", [id]);
      if (red) await t.query("update discount_codes set redemptions_count = greatest(redemptions_count - 1, 0) where id = $1", [red.discount_code_id]);
      count++;
    });
  }
  return count;
}
