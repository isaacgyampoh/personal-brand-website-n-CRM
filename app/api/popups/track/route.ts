import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/database/pool";
import { anonymousHash } from "@/lib/security/crypto";
import { clientIp, deviceFromUserAgent } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { ATTR_COOKIE, currentAttribution, encodeAttribution } from "@/lib/attribution";
import { isLivePopup } from "@/features/popups/application/popups";

const schema = z.object({ id: z.string().uuid(), name: z.enum(["impression", "click", "dismiss"]), path: z.string().max(500).startsWith("/") });

/** Cookieless pop-up analytics (daily-rotating salted hash, no IP stored). A click also records attribution for conversions. */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return new Response(null, { status: 204 });
    const ua = request.headers.get("user-agent");
    const device = deviceFromUserAgent(ua);
    if (device === "bot") return new Response(null, { status: 204 });
    const ip = await clientIp();
    await rateLimit(`popup:${anonymousHash(ip)}`, 60, 60);
    const e = parsed.data;
    if (!(await isLivePopup(e.id))) return new Response(null, { status: 204 });
    await db.query("insert into popup_events (popup_id, name, visitor_hash, device, path) values ($1,$2,$3,$4,$5)",
      [e.id, e.name, anonymousHash(`${ip}|${ua ?? ""}`), device, e.path.split("?")[0]]);
    if (e.name === "click") {
      const attr = await currentAttribution();
      (await cookies()).set(ATTR_COOKIE, encodeAttribution({ ...attr, popupId: e.id, popupAt: new Date().toISOString() }), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400, path: "/",
      });
    }
  } catch {
    // analytics must never break the site
  }
  return new Response(null, { status: 204 });
}
