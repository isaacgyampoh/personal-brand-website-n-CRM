import { storage } from "@/lib/storage";
import { db } from "@/lib/database/pool";

/** Public media for the local storage driver (development). In production, R2 serves public media. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  const asset = await db.one<{ mime_type: string }>(
    `select mime_type from media_assets where visibility = 'public' and deleted_at is null
       and (storage_key = $1 or variants @> jsonb_build_array(jsonb_build_object('key', $1::text)))`,
    [key],
  );
  if (!asset) return new Response("Not found", { status: 404 });
  const body = await (await storage()).get(key, "public");
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: { "content-type": key.endsWith(".webp") ? "image/webp" : asset.mime_type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
