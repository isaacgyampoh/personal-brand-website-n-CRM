import "server-only";
import { raisedToken } from "@/lib/database/errors";
import type { Fulfiller } from "@/features/commerce/application/fulfillers";
import { eventRepo } from "../infrastructure/repository";
import { scheduleWaitlistCheck, sendRegistrationConfirmations } from "./registration";

export const eventTicketFulfiller: Fulfiller = {
  async onPaid(t, { order, items }) {
    try {
      // Reserved → confirmed; an expired hold is re-checked against capacity by the trigger.
      await t.query(
        `update event_registrations set status = 'confirmed', hold_expires_at = null
          where order_id = $1 and status in ('reserved','expired')`,
        [order.id],
      );
    } catch (error) {
      const token = raisedToken(error);
      if (token === "EVENT_SOLD_OUT" || token === "TICKET_SOLD_OUT") {
        throw new Error("Event sold out before the late payment arrived");
      }
      throw error;
    }
    const eventId = String(items[0]?.metadata?.eventId ?? "");
    const event = eventId ? await eventRepo.byId(eventId, t) : null;
    if (event) await sendRegistrationConfirmations(t, event, { orderId: order.id });
    return { ok: true };
  },
  async onReleased(t, order, items) {
    await t.query(`update event_registrations set status = 'expired' where order_id = $1 and status = 'reserved'`, [order.id]);
    const eventId = String(items[0]?.metadata?.eventId ?? "");
    if (eventId) await scheduleWaitlistCheck(t, eventId);
  },
  async onRefunded(t, order, items) {
    await t.query(`update event_registrations set status = 'refunded' where order_id = $1 and status in ('confirmed','reserved')`, [order.id]);
    const eventId = String(items[0]?.metadata?.eventId ?? "");
    if (eventId) await scheduleWaitlistCheck(t, eventId);
  },
};
