import "server-only";
import { env } from "@/lib/config/env";
import type { Fulfiller } from "@/features/commerce/application/fulfillers";
import { grantEntitlement, revokeOrderEntitlements } from "@/features/commerce/application/entitlements";
import { enqueueEmail } from "@/features/notifications/application/send";

export const productFulfiller: Fulfiller = {
  async onPaid(t, { order, items }) {
    for (const item of items) {
      const product = await t.one<{ id: string; title: string }>("select id, title from products where id = $1", [item.item_id]);
      if (!product) throw new Error("Product no longer exists");
      await grantEntitlement(t, { contactId: order.contact_id, userId: order.user_id, resourceType: "product", resourceId: product.id, orderId: order.id, source: order.total_minor > 0 ? "purchase" : "free" });
      await enqueueEmail({
        to: order.email,
        template: "product_access",
        data: { name: order.customer_name || "there", productTitle: product.title, libraryUrl: `${env().APP_URL}/portal/library` },
        idempotencyKey: `product:${order.id}:${product.id}`,
      }, t);
    }
    return { ok: true };
  },
  async onReleased() {},
  async onRefunded(t, order) {
    await revokeOrderEntitlements(t, order.id, "refunded");
  },
};
