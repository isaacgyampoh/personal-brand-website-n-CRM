import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("finance:export")) return new Response("Forbidden", { status: 403 });
  const rows = await db.query<Record<string, unknown>>(
    `select o.reference, o.created_at, o.paid_at, o.status, o.customer_name, o.email, o.currency, o.subtotal_minor, o.discount_minor, o.total_minor, o.refunded_minor,
            i.number as receipt, (select string_agg(description, '; ') from order_items x where x.order_id = o.id) as items,
            o.attribution->>'utm_source' as utm_source, o.attribution->>'utm_campaign' as utm_campaign
       from orders o left join invoices i on i.order_id = o.id order by o.created_at desc limit 100000`);
  await audit({ actorId: user.id, action: "finance.export_orders", entityType: "order", data: { count: rows.length } });
  const cols = ["reference", "created_at", "paid_at", "status", "customer_name", "email", "currency", "subtotal_minor", "discount_minor", "total_minor", "refunded_minor", "receipt", "items", "utm_source", "utm_campaign"];
  return csvResponse(`orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(cols, rows.map((r) => cols.map((c) => r[c]))));
}
