import { NextResponse } from "next/server";
import { db } from "@/lib/database/pool";
import { anonymousHash } from "@/lib/security/crypto";
import { clientIp, deviceFromUserAgent } from "@/lib/security/request";
import { ATTR_COOKIE, encodeAttribution } from "@/lib/attribution";

/** Branded tracked links: /go/<slug> → destination, recording a click and attribution. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = new URL(request.url);
  const link = await db.one<{ id: string; destination: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; channel: string }>(
    "select * from campaign_links where slug = $1 and active",
    [slug.toLowerCase().slice(0, 100)],
  );
  if (!link) return NextResponse.redirect(new URL("/", base));
  const dest = new URL(link.destination, base);
  const utm = { utm_source: link.utm_source ?? link.channel, utm_medium: link.utm_medium ?? "social", utm_campaign: link.utm_campaign ?? slug, utm_content: link.utm_content ?? undefined };
  if (dest.origin === base.origin) for (const [k, v] of Object.entries(utm)) if (v && !dest.searchParams.has(k)) dest.searchParams.set(k, v);
  const ua = request.headers.get("user-agent");
  if (deviceFromUserAgent(ua) !== "bot") {
    let ref: string | null = null;
    try { ref = request.headers.get("referer") ? new URL(request.headers.get("referer")!).hostname : null; } catch {}
    await db.query("insert into link_clicks (link_id, visitor_hash, referrer_host) values ($1,$2,$3)", [link.id, anonymousHash(`${await clientIp()}|${ua ?? ""}`), ref]);
  }
  const res = NextResponse.redirect(dest, 302);
  res.cookies.set(ATTR_COOKIE, encodeAttribution({ linkId: link.id, ...utm, landing: dest.pathname, at: new Date().toISOString() }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400, path: "/",
  });
  return res;
}
