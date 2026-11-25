import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/database/pool";
import { anonymousHash } from "@/lib/security/crypto";
import { clientIp, deviceFromUserAgent } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { ATTR_COOKIE, encodeAttribution, currentAttribution } from "@/lib/attribution";

const schema = z.object({
  name: z.enum(["page_view", "cta_click", "booking_started", "checkout_started"]),
  path: z.string().max(500).startsWith("/"),
  referrer: z.string().max(500).nullable().optional(),
  utm_source: z.string().max(100).nullable().optional(),
  utm_medium: z.string().max(100).nullable().optional(),
  utm_campaign: z.string().max(100).nullable().optional(),
});

/** First-party, cookieless analytics. Stores no IP, only a daily-rotating salted hash. */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return new Response(null, { status: 204 });
    const ip = await clientIp();
    await rateLimit(`analytics:${anonymousHash(ip)}`, 120, 60);
    const ua = request.headers.get("user-agent");
    const device = deviceFromUserAgent(ua);
    if (device === "bot") return new Response(null, { status: 204 });
    const e = parsed.data;
    if (/^\/(admin|portal|api)/.test(e.path)) return new Response(null, { status: 204 });
    let referrerHost: string | null = null;
    try {
      referrerHost = e.referrer ? new URL(e.referrer).hostname.slice(0, 120) : null;
    } catch {}
    const self = new URL(request.url).hostname;
    if (referrerHost === self) referrerHost = null;
    const attr = await currentAttribution();
    await db.query(
      `insert into analytics_events (name, path, referrer_host, utm_source, utm_medium, utm_campaign, link_id, visitor_hash, device)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.name, e.path.split("?")[0], referrerHost, e.utm_source ?? attr.utm_source ?? null, e.utm_medium ?? attr.utm_medium ?? null,
       e.utm_campaign ?? attr.utm_campaign ?? null, attr.linkId ?? null, anonymousHash(`${ip}|${ua ?? ""}`), device],
    );
    // First-touch campaign attribution from UTM landings (no tracking identifiers).
    if (e.utm_source && !attr.utm_source && !attr.linkId) {
      (await cookies()).set(ATTR_COOKIE, encodeAttribution({ utm_source: e.utm_source, utm_medium: e.utm_medium ?? undefined, utm_campaign: e.utm_campaign ?? undefined, landing: e.path, at: new Date().toISOString() }), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400, path: "/",
      });
    }
  } catch {
    // analytics must never break the site
  }
  return new Response(null, { status: 204 });
}
