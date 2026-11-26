import "server-only";
import { UserError } from "@/lib/errors";
import { db, tx, type Db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { humanReference, signValue } from "@/lib/security/crypto";
import { upsertContact, logActivity, type ContactInput } from "@/features/crm/application/contacts";
import { paymentGateway } from "@/features/payments/application/gateway";
import { PaymentsNotConfiguredError } from "@/features/payments/domain/gateway";
import { loadSetting } from "@/features/settings/application/settings";
import { computeTotals, discountProblem, DISCOUNT_MESSAGES, type DiscountCode, type LineItem } from "../domain/order";
import { fulfilOrder } from "./fulfilment";

export class CheckoutError extends UserError {}

export type OrderRow = {
  id: string;
  reference: string;
  contact_id: string;
  user_id: string | null;
  email: string;
  customer_name: string;
  status: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  refunded_minor: number;
  discount_code_id: string | null;
  expires_at: Date | null;
  paid_at: Date | null;
  fulfilled_at: Date | null;
  created_at: Date;
  attention_reason: string | null;
};

export async function holdMinutes(): Promise<number> {
  return (await loadSetting("commerce")).holdMinutes;
}

/**
 * Creates a pending order inside the caller's transaction. Item-specific
 * reservations (seats, slots) are created by the caller in the same
 * transaction, so either everything is reserved or nothing is.
 */
export async function createOrder(
  t: Db,
  input: {
    customer: ContactInput & { email: string; fullName: string };
    userId?: string | null;
    items: LineItem[];
    discountCode?: string | null;
    attribution?: Record<string, unknown>;
    expiresAt: Date;
  },
): Promise<{ order: OrderRow; contactId: string }> {
  const { id: contactId } = await upsertContact(t, { ...input.customer, attribution: input.attribution });

  let discount: DiscountCode | null = null;
  if (input.discountCode?.trim()) {
    discount = await t.one<DiscountCode>("select * from discount_codes where code = $1 for update", [input.discountCode.trim()]);
    if (!discount) throw new CheckoutError("That discount code isn't valid.");
    const used = await t.one<{ n: number }>(
      `select count(*)::int as n from discount_redemptions r join orders o on o.id = r.order_id
        where r.discount_code_id = $1 and r.contact_id = $2 and o.status not in ('expired','failed','cancelled')`,
      [discount.id, contactId],
    );
    const problem = discountProblem(discount, input.items, new Date(), used?.n ?? 0);
    if (problem) throw new CheckoutError(DISCOUNT_MESSAGES[problem]);
  }

  const totals = computeTotals(input.items, discount);
  const order = await t.one<OrderRow>(
    `insert into orders (reference, contact_id, user_id, email, customer_name, currency, subtotal_minor, discount_minor,
        total_minor, discount_code_id, attribution, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [humanReference("ORD", 10), contactId, input.userId ?? null, input.customer.email.toLowerCase(), input.customer.fullName,
     totals.currency, totals.subtotalMinor, totals.discountMinor, totals.totalMinor,
     discount && totals.discountMinor > 0 ? discount.id : null, JSON.stringify(input.attribution ?? {}), input.expiresAt],
  );
  for (const i of input.items) {
    await t.query(
      `insert into order_items (order_id, item_type, item_id, description, quantity, unit_price_minor, total_minor, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [order!.id, i.itemType, i.itemId, i.description.slice(0, 300), i.quantity, i.unitPriceMinor, i.unitPriceMinor * i.quantity, JSON.stringify(i.metadata ?? {})],
    );
  }
  if (discount && totals.discountMinor > 0) {
    // Reserve a redemption now; released if the order expires/fails.
    await t.query("update discount_codes set redemptions_count = redemptions_count + 1 where id = $1", [discount.id]);
    await t.query("insert into discount_redemptions (discount_code_id, order_id, contact_id) values ($1,$2,$3)", [discount.id, order!.id, contactId]);
  }
  await logActivity(t, contactId, "purchase", `Started checkout ${order!.reference}`, {
    data: { orderId: order!.id, total: totals.totalMinor, currency: totals.currency },
  });
  return { order: order!, contactId };
}

/**
 * Next step after creating an order. Free orders are fulfilled immediately
 * (inside the same transaction); paid orders get a payment attempt + redirect.
 */
export async function completeFreeOrderIfZero(t: Db, order: OrderRow): Promise<boolean> {
  if (order.total_minor !== 0) return false;
  await t.query("update orders set status = 'paid', paid_at = now(), expires_at = null where id = $1", [order.id]);
  await fulfilOrder(t, order.id, { source: "free" });
  return true;
}

/** Signed token appended to provider callback URLs that are not themselves signed (Hubtel). */
export function callbackToken(reference: string): string {
  return signValue(`pay:${reference}`, Math.floor(Date.now() / 1000) + 7 * 86400);
}

/** Starts (or restarts) an online payment attempt for a pending order with the active provider. */
export async function startPayment(orderId: string): Promise<{ authorizationUrl: string }> {
  const gateway = await paymentGateway(undefined, "checkout");
  if (!gateway) throw new PaymentsNotConfiguredError();
  const prepared = await tx(async (t) => {
    const order = await t.one<OrderRow>("select * from orders where id = $1 for update", [orderId]);
    if (!order) throw new CheckoutError("Order not found.");
    if (!["pending", "failed"].includes(order.status)) throw new CheckoutError("This order can no longer be paid.");
    if (order.expires_at && order.expires_at < new Date()) throw new CheckoutError("This reservation has expired. Please start again.");
    const attempts = await t.one<{ n: number }>("select count(*)::int as n from payments where order_id = $1", [orderId]);
    if ((attempts?.n ?? 0) >= 8) throw new CheckoutError("Too many payment attempts for this order. Please contact us.");
    // Never re-route a payment that may still complete at another provider.
    const open = await t.one<{ provider: string }>(
      "select provider from payments where order_id = $1 and status = 'initialized' and provider <> $2 and created_at > now() - interval '72 hours' limit 1",
      [orderId, gateway.name],
    );
    if (open) throw new CheckoutError("A payment for this order is still being processed by another provider. Please wait a few minutes or contact us.");
    const reference = `${order.reference}-P${(attempts?.n ?? 0) + 1}`;
    await t.query(
      `insert into payments (order_id, provider, provider_mode, provider_reference, amount_minor, currency, status)
       values ($1, $2, $3, $4, $5, $6, 'initialized')`,
      [order.id, gateway.name, gateway.mode, reference, order.total_minor, order.currency],
    );
    const desc = await t.one<{ d: string }>("select string_agg(description, ', ') as d from order_items where order_id = $1", [order.id]);
    return { order, reference, description: desc?.d || `Order ${order.reference}` };
  });

  const app = env().APP_URL;
  const complete = `${app}/checkout/complete?reference=${encodeURIComponent(prepared.reference)}`;
  const { authorizationUrl } = await gateway.initialize({
    reference: prepared.reference,
    amountMinor: prepared.order.total_minor,
    currency: prepared.order.currency,
    email: prepared.order.email,
    callbackUrl: gateway.name === "hubtel"
      ? `${app}/api/webhooks/hubtel?token=${encodeURIComponent(callbackToken(prepared.reference))}`
      : `${app}/checkout/complete`,
    returnUrl: complete,
    cancelUrl: `${complete}&cancelled=1`,
    description: prepared.description,
    metadata: { order_reference: prepared.order.reference, order_id: prepared.order.id },
  });
  await db.query("update payments set authorization_url = $3 where provider = $1 and provider_reference = $2", [
    gateway.name,
    prepared.reference,
    authorizationUrl,
  ]);
  return { authorizationUrl };
}

export async function getOrderByReference(reference: string): Promise<OrderRow | null> {
  return db.one<OrderRow>("select * from orders where reference = $1", [reference]);
}
