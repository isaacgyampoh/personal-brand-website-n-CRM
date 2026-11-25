import "server-only";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { isExclusionViolation, raisedToken } from "@/lib/database/errors";
import type { Fulfiller } from "@/features/commerce/application/fulfillers";
import { sendBookingConfirmation } from "./booking";

export const appointmentFulfiller: Fulfiller = {
  async onPaid(t, { items }) {
    for (const item of items) {
      const token = randomToken(24);
      try {
        // An 'expired' hold re-enters the exclusion constraint here: if the
        // slot was taken meanwhile, this raises and the order needs attention.
        const row = await t.one<{ id: string }>(
          `update appointments set status = 'confirmed', hold_expires_at = null, manage_token_hash = $2
            where id = $1 and status in ('pending_payment','expired') returning id`,
          [item.item_id, hashToken(token)],
        );
        if (row) await sendBookingConfirmation(t, row.id, token);
      } catch (error) {
        if (isExclusionViolation(error) || raisedToken(error) === "SLOT_FULL") {
          throw new Error("Appointment slot was taken before payment completed");
        }
        throw error;
      }
    }
    return { ok: true };
  },
  async onReleased(t, _order, items) {
    for (const item of items) {
      await t.query(`update appointments set status = 'expired' where id = $1 and status = 'pending_payment'`, [item.item_id]);
    }
  },
  async onRefunded(t, _order, items) {
    for (const item of items) {
      await t.query(
        `update appointments set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), cancelled_by = coalesce(cancelled_by, 'admin'),
           cancel_reason = coalesce(cancel_reason, 'Refunded') where id = $1 and status in ('confirmed','pending_payment') and starts_at > now()`,
        [item.item_id],
      );
    }
  },
};
