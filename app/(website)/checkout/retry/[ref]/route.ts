import { NextResponse } from "next/server";
import { db } from "@/lib/database/pool";
import { startPayment } from "@/features/commerce/application/checkout";
import { rateLimit } from "@/lib/security/rate-limit";
import { ipHash } from "@/lib/security/request";

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const base = new URL(request.url);
  if (!/^ORD-[A-Z0-9]{10}$/.test(ref)) return NextResponse.redirect(new URL("/", base));
  try {
    await rateLimit(`retry:${await ipHash()}`, 10, 600);
    const order = await db.one<{ id: string }>("select id from orders where reference = $1", [ref]);
    if (!order) return NextResponse.redirect(new URL("/", base));
    const { authorizationUrl } = await startPayment(order.id);
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const msg = encodeURIComponent((error as Error).message.slice(0, 200));
    return NextResponse.redirect(new URL(`/checkout/complete?order=${ref}&error=${msg}`, base));
  }
}
