import { getCurrentUser } from "@/lib/auth/session";
import { listMedia, mediaUrl } from "@/features/media/application/media";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isStaff) return Response.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const kind = sp.get("kind") === "image" ? "image" : sp.get("kind") === "file" ? "file" : undefined;
  const visibility = sp.get("visibility") === "private" ? "private" : sp.get("visibility") === "public" ? "public" : undefined;
  const items = await listMedia({ q: sp.get("q") ?? undefined, kind, visibility, page: Number(sp.get("page")) || 1 });
  return Response.json({ items: items.map((a) => ({ id: a.id, filename: a.filename, url: mediaUrl(a), mime: a.mime_type, visibility: a.visibility, alt: a.alt_text, width: a.width, height: a.height, size: a.size_bytes })) });
}
