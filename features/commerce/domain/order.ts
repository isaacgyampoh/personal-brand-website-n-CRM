import { computeDiscount } from "@/lib/money";

export type ItemType = "appointment" | "event_ticket" | "course" | "product";

/** A priced line item. Prices ALWAYS come from the database, never the browser. */
export type LineItem = {
  itemType: ItemType;
  itemId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  metadata?: Record<string, unknown>;
};

export type DiscountCode = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  currency: string | null;
  applies_to: "all" | ItemType;
  target_id: string | null;
  max_redemptions: number | null;
  per_customer_limit: number;
  redemptions_count: number;
  starts_at: Date | null;
  ends_at: Date | null;
  active: boolean;
};

export type OrderTotals = { currency: string; subtotalMinor: number; discountMinor: number; totalMinor: number };

export function computeTotals(items: LineItem[], discount?: DiscountCode | null): OrderTotals {
  if (items.length === 0) throw new Error("Order has no items");
  const currency = items[0].currency.toUpperCase();
  if (items.some((i) => i.currency.toUpperCase() !== currency)) throw new Error("All items must share one currency");
  for (const i of items) {
    if (!Number.isInteger(i.unitPriceMinor) || i.unitPriceMinor < 0) throw new Error("Invalid price");
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error("Invalid quantity");
  }
  const subtotalMinor = items.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
  let discountMinor = 0;
  if (discount) {
    const eligible = items
      .filter((i) => discount.applies_to === "all" || (i.itemType === discount.applies_to && (!discount.target_id || discount.target_id === i.itemId)))
      .reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
    discountMinor = computeDiscount(eligible, discount, currency);
  }
  return { currency, subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor };
}

export type DiscountProblem = "inactive" | "not_started" | "expired" | "exhausted" | "not_applicable" | "customer_limit";

export function discountProblem(
  d: DiscountCode,
  items: LineItem[],
  now: Date,
  customerRedemptions: number,
): DiscountProblem | null {
  if (!d.active) return "inactive";
  if (d.starts_at && d.starts_at > now) return "not_started";
  if (d.ends_at && d.ends_at < now) return "expired";
  if (d.max_redemptions !== null && d.redemptions_count >= d.max_redemptions) return "exhausted";
  if (customerRedemptions >= d.per_customer_limit) return "customer_limit";
  const applicable = items.some(
    (i) => d.applies_to === "all" || (i.itemType === d.applies_to && (!d.target_id || d.target_id === i.itemId)),
  );
  if (!applicable) return "not_applicable";
  return null;
}

export const DISCOUNT_MESSAGES: Record<DiscountProblem, string> = {
  inactive: "This code is not active.",
  not_started: "This code isn't valid yet.",
  expired: "This code has expired.",
  exhausted: "This code has reached its usage limit.",
  not_applicable: "This code doesn't apply to this purchase.",
  customer_limit: "You've already used this code.",
};
