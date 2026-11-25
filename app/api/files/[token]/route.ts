import { verifySignedValue } from "@/lib/security/crypto";
import { storage } from "@/lib/storage";
import { db } from "@/lib/database/pool";

/** Serves private objects for the local storage driver via short-lived signed tokens. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = verifySignedValue((await params).token);
  if (!v) return new Response("This link has expired.", { status: 403 });
  const { k, n } = JSON.parse(v) as { k: string; n: string | null };
  const asset = await db.one<{ mime_type: string }>("select mime_type from media_assets where storage_key = $1 and visibility = 'private'", [k]);
  const body = await storage().get(k, "private");
  if (!body || !asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": asset.mime_type,
      "content-disposition": n ? `attachment; filename="${n.replace(/[^\w.\- ]/g, "_")}"` : "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
