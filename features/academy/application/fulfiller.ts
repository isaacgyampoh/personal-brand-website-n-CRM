import "server-only";
import { env } from "@/lib/config/env";
import type { Fulfiller } from "@/features/commerce/application/fulfillers";
import { grantEntitlement, revokeOrderEntitlements } from "@/features/commerce/application/entitlements";
import { enqueueEmail } from "@/features/notifications/application/send";
import { logActivity } from "@/features/crm/application/contacts";

export const courseFulfiller: Fulfiller = {
  async onPaid(t, { order, items }) {
    for (const item of items) {
      const course = await t.one<{ id: string; title: string; slug: string }>("select id, title, slug from courses where id = $1", [item.item_id]);
      if (!course) throw new Error("Course no longer exists");
      await t.query(
        `insert into enrolments (course_id, contact_id, user_id, order_id) values ($1,$2,$3,$4)
         on conflict (course_id, contact_id) do update set status = 'active', order_id = excluded.order_id
           where enrolments.status = 'revoked'`,
        [course.id, order.contact_id, order.user_id, order.id],
      );
      await grantEntitlement(t, { contactId: order.contact_id, userId: order.user_id, resourceType: "course", resourceId: course.id, orderId: order.id, source: order.total_minor > 0 ? "purchase" : "free" });
      await logActivity(t, order.contact_id, "enrolment", `Enrolled in ${course.title}`);
      await enqueueEmail({
        to: order.email,
        template: "course_enrolled",
        data: { name: order.customer_name || "there", courseTitle: course.title, courseUrl: `${env().APP_URL}/portal/courses/${course.slug}` },
        idempotencyKey: `enrolled:${order.id}:${course.id}`,
      }, t);
    }
    return { ok: true };
  },
  async onReleased() {},
  async onRefunded(t, order, items) {
    for (const item of items) {
      await t.query(`update enrolments set status = 'revoked' where course_id = $1 and contact_id = $2`, [item.item_id, order.contact_id]);
    }
    await revokeOrderEntitlements(t, order.id, "refunded");
  },
};
