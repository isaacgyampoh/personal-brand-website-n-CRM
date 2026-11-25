import "server-only";
import { db } from "@/lib/database/pool";

export type ReconIssue = { kind: string; severity: "high" | "medium" | "low"; orderId: string | null; reference: string | null; detail: string };

/**
 * Cross-checks orders, payments, the immutable ledger, refunds and receipts.
 * An empty result means the books reconcile.
 */
export async function reconciliationReport(): Promise<{ issues: ReconIssue[]; totals: { ledgerNet: number; ordersNet: number; paymentsSuccess: number; refundsProcessed: number } }> {
  const issues: ReconIssue[] = [];
  const push = (rows: { order_id: string | null; reference: string | null; detail: string }[], kind: string, severity: ReconIssue["severity"]) =>
    rows.forEach((r) => issues.push({ kind, severity, orderId: r.order_id, reference: r.reference, detail: r.detail }));

  push(await db.query(
    `select o.id as order_id, o.reference, 'Order is ' || o.status || ' but the ledger nets ' || coalesce(l.net,0) || ' vs expected ' || (o.total_minor - o.refunded_minor) as detail
       from orders o left join (select order_id, sum(amount_minor) net from financial_ledger group by order_id) l on l.order_id = o.id
      where o.status in ('paid','refunded','partially_refunded') and o.total_minor > 0 and coalesce(l.net,0) <> o.total_minor - o.refunded_minor`,
  ), "ledger_mismatch", "high");
  push(await db.query(
    `select p.order_id, o.reference, 'Payment ' || p.provider_reference || ' succeeded but order is ' || o.status as detail
       from payments p join orders o on o.id = p.order_id where p.status = 'success' and o.status not in ('paid','refunded','partially_refunded','needs_attention')`,
  ), "payment_without_paid_order", "high");
  push(await db.query(
    `select o.id as order_id, o.reference, 'Paid order has no successful payment record' as detail
       from orders o where o.status in ('paid','partially_refunded','refunded') and o.total_minor > 0
        and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'success')`,
  ), "paid_without_payment", "high");
  push(await db.query(
    `select o.id as order_id, o.reference, 'Order needs attention: ' || coalesce(o.attention_reason, '') as detail from orders o where o.status = 'needs_attention'`,
  ), "needs_attention", "high");
  push(await db.query(
    `select o.id as order_id, o.reference, 'Paid order has no receipt' as detail from orders o
      where o.status in ('paid','partially_refunded','refunded') and o.total_minor > 0 and not exists (select 1 from invoices i where i.order_id = o.id)`,
  ), "missing_receipt", "medium");
  push(await db.query(
    `select o.id as order_id, o.reference, 'Paid order was never fulfilled' as detail from orders o where o.status = 'paid' and o.fulfilled_at is null`,
  ), "unfulfilled", "high");
  push(await db.query(
    `select r.order_id, o.reference, 'Refund ' || r.status || ' since ' || to_char(r.created_at, 'YYYY-MM-DD') as detail
       from refunds r join orders o on o.id = r.order_id where r.status in ('pending','processing') and r.created_at < now() - interval '2 days'`,
  ), "refund_stuck", "medium");
  push(await db.query(
    `select r.order_id, o.reference, 'Refund failed: ' || coalesce(r.failure_reason,'') as detail from refunds r join orders o on o.id = r.order_id where r.status = 'failed'`,
  ), "refund_failed", "high");
  push(await db.query(
    `select null::uuid as order_id, reference, 'Webhook ' || event_type || ' failed: ' || processing_error as detail
       from payment_events where processing_error is not null and processed_at is null and received_at > now() - interval '30 days'`,
  ), "webhook_error", "medium");
  push(await db.query(
    `select p.order_id, o.reference, 'Payment attempt still unverified after 30 minutes' as detail
       from payments p join orders o on o.id = p.order_id where p.status = 'initialized' and p.created_at < now() - interval '30 minutes' and p.created_at > now() - interval '72 hours'`,
  ), "unverified_payment", "low");

  const totals = await db.one<{ ledgerNet: number; ordersNet: number; paymentsSuccess: number; refundsProcessed: number }>(
    `select (select coalesce(sum(amount_minor),0) from financial_ledger)::bigint as "ledgerNet",
            (select coalesce(sum(total_minor - refunded_minor),0) from orders where status in ('paid','refunded','partially_refunded'))::bigint as "ordersNet",
            (select coalesce(sum(amount_minor),0) from payments where status = 'success')::bigint as "paymentsSuccess",
            (select coalesce(sum(amount_minor),0) from refunds where status = 'processed')::bigint as "refundsProcessed"`,
  );
  return { issues, totals: totals! };
}
