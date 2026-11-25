import "server-only";
import type { Db } from "@/lib/database/pool";
import type { OrderRow } from "./checkout";
import { appointmentFulfiller } from "@/features/bookings/application/fulfiller";
import { eventTicketFulfiller } from "@/features/events/application/fulfiller";
import { courseFulfiller } from "@/features/academy/application/fulfiller";
import { productFulfiller } from "@/features/shop/application/fulfiller";

export type OrderItemRow = {
  id: string; order_id: string; item_type: "appointment" | "event_ticket" | "course" | "product"; item_id: string;
  description: string; quantity: number; unit_price_minor: number; total_minor: number; metadata: Record<string, unknown>;
};

export type FulfilResult = { ok: true } | { ok: false; reason: string };

/**
 * Port implemented by each sellable feature. Handlers run inside the order's
 * transaction (under a savepoint) and must be idempotent.
 */
export interface Fulfiller {
  onPaid(t: Db, ctx: { order: OrderRow; items: OrderItemRow[]; late: boolean }): Promise<FulfilResult>;
  /** Order expired or cancelled before payment: release holds. */
  onReleased(t: Db, order: OrderRow, items: OrderItemRow[]): Promise<void>;
  /** Order fully refunded: revoke access / cancel. */
  onRefunded(t: Db, order: OrderRow, items: OrderItemRow[]): Promise<void>;
}

export const fulfillers: Record<OrderItemRow["item_type"], Fulfiller> = {
  appointment: appointmentFulfiller,
  event_ticket: eventTicketFulfiller,
  course: courseFulfiller,
  product: productFulfiller,
};
