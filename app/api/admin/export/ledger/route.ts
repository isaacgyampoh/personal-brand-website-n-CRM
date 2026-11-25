import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("finance:export")) return new Response("Forbidden", { status: 403 });
  const rows = await db.query<Record<string, unknown>>(
    `select l.id, l.created_at, l.kind, l.amount_minor, l.currency, o.reference as order_reference, p.provider, p.provider_reference, p.channel, l.memo
       from financial_ledger l join orders o on o.id = l.order_id left join payments p on p.id = l.payment_id order by l.id`);
  await audit({ actorId: user.id, action: "finance.export_ledger", entityType: "ledger", data: { count: rows.length } });
  const cols = ["id", "created_at", "kind", "amount_minor", "currency", "order_reference", "provider", "provider_reference", "channel", "memo"];
  return csvResponse(`ledger-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(cols, rows.map((r) => cols.map((c) => r[c]))));
}
