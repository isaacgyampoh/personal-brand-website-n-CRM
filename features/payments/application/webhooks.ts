import "server-only";
import { db, tx } from "@/lib/database/pool";
import { enqueue } from "@/lib/jobs/queue";
import { paymentGateway } from "./gateway";
import { verifyAndApply } from "@/features/commerce/application/fulfilment";
import { markRefundFailed, markRefundProcessed } from "@/features/commerce/application/refunds";

/**
 * Webhook intake: authenticate, store once, acknowledge fast. Processing
 * happens on the durable queue so provider retries never double-fulfil.
 */
export async function receiveWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: string }> {
  const gateway = paymentGateway();
  if (!gateway) return { status: 503, body: "payments not configured" };
  if (rawBody.length > 512_000) return { status: 413, body: "too large" };
  if (!gateway.verifyWebhookSignature(rawBody, signature)) return { status: 401, body: "invalid signature" };

  let evt;
  try {
    evt = gateway.parseWebhook(rawBody);
  } catch {
    return { status: 400, body: "malformed" };
  }
  const inserted = await db.one<{ id: string }>(
    `insert into payment_events (provider, event_key, event_type, reference, payload, signature_valid)
     values ($1, $2, $3, $4, $5, true) on conflict (provider, event_key) do nothing returning id`,
    [gateway.name, evt.eventKey, evt.type, evt.reference, JSON.stringify(evt.payload)],
  );
  if (inserted) {
    await enqueue("payment.webhook", { eventId: inserted.id }, { idempotencyKey: `webhook:${inserted.id}`, maxAttempts: 10 });
  }
  return { status: 200, body: "ok" };
}

/** Job handler for a stored webhook event. Safe to run more than once. */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const ev = await db.one<{ id: string; event_type: string; reference: string | null; payload: { data?: { id?: number | string } }; processed_at: Date | null }>(
    "select id, event_type, reference, payload, processed_at from payment_events where id = $1",
    [eventId],
  );
  if (!ev || ev.processed_at) return;
  try {
    switch (ev.event_type) {
      case "charge.success": {
        if (!ev.reference) break;
        // Never trust the webhook body for amounts: verify with the provider API.
        const result = await verifyAndApply(ev.reference);
        if (result.status === "pending") throw new Error("Transaction still pending at provider; will retry");
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const providerRefundId = ev.payload.data?.id != null ? String(ev.payload.data.id) : null;
        const refund = providerRefundId
          ? await db.one<{ id: string }>("select id from refunds where provider_refund_id = $1", [providerRefundId])
          : null;
        if (!refund) throw new Error("Refund not yet recorded locally (out-of-order event); will retry");
        if (ev.event_type === "refund.processed") await tx((t) => markRefundProcessed(t, refund.id, providerRefundId));
        else await markRefundFailed(refund.id, "Provider reported refund failure");
        break;
      }
      default:
        break; // acknowledged and ignored
    }
    await db.query("update payment_events set processed_at = now(), processing_error = null where id = $1", [ev.id]);
  } catch (error) {
    await db.query("update payment_events set processing_error = $2 where id = $1", [ev.id, (error as Error).message.slice(0, 1000)]);
    throw error;
  }
}
