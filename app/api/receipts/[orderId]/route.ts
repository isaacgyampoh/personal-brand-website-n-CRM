import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { renderReceiptPdf } from "@/features/commerce/application/receipts";

/** Receipt PDF: staff with payments:view, or the customer who owns the order (verified account link). */
export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in", { status: 401 });
  const staff = user.isStaff && user.permissions.has("payments:view");
  if (!staff) {
    const owns = await db.one("select 1 from orders o join contacts c on c.id = o.contact_id where o.id = $1 and c.user_id = $2", [orderId, user.id]);
    if (!owns) return new Response("Not found", { status: 404 });
  }
  const pdf = await renderReceiptPdf(orderId);
  if (!pdf) return new Response("No receipt", { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${pdf.number}.pdf"`, "cache-control": "private, no-store" } });
}
