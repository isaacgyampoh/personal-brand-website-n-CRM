import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { uploadMedia, mediaUrl, UploadError } from "@/features/media/application/media";

export const maxDuration = 120;

/** Multipart upload (one or more files). Staff with media:manage only. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("media:manage")) return Response.json({ error: "Forbidden" }, { status: 403 });
  await rateLimit(`upload:${user.id}`, 120, 3600);
  const fd = await request.formData();
  const visibility = fd.get("visibility") === "private" ? "private" : "public";
  const results = [];
  for (const f of fd.getAll("file")) {
    if (!(f instanceof File)) continue;
    try {
      const { asset, duplicate } = await uploadMedia({
        bytes: Buffer.from(await f.arrayBuffer()), filename: f.name, visibility,
        altText: String(fd.get("alt") ?? ""), category: String(fd.get("category") ?? "general"), actorId: user.id,
      });
      results.push({ ok: true, duplicate, asset: { id: asset.id, filename: asset.filename, url: mediaUrl(asset), mime: asset.mime_type, width: asset.width, height: asset.height } });
    } catch (e) {
      results.push({ ok: false, filename: f.name, error: e instanceof UploadError ? e.message : "Upload failed" });
      if (!(e instanceof UploadError)) console.error("[upload]", e);
    }
  }
  return Response.json({ results });
}
