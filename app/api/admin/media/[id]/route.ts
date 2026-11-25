import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { mediaUrl, type MediaAsset } from "@/features/media/application/media";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isStaff) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const a = await db.one<MediaAsset>("select * from media_assets where id = $1 and deleted_at is null", [id]);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ id: a.id, filename: a.filename, url: mediaUrl(a), mime: a.mime_type, visibility: a.visibility, alt: a.alt_text });
}
