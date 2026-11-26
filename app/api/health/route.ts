import { db } from "@/lib/database/pool";

export const dynamic = "force-dynamic";

/** Liveness + DB readiness for Docker/Caddy health checks. Reveals no internals. */
export async function GET() {
  try {
    await db.one("select 1");
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
