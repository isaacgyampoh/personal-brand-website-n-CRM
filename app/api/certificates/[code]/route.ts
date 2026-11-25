import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { renderCertificatePdf } from "@/features/academy/application/certificates";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in", { status: 401 });
  const owns = await db.one("select 1 from certificates ce join contacts c on c.id = ce.contact_id where ce.code = $1 and (c.user_id = $2 or $3)", [code, user.id, user.isStaff]);
  if (!owns) return new Response("Not found", { status: 404 });
  const pdf = await renderCertificatePdf(code);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${code}.pdf"`, "cache-control": "private, no-store" } });
}
