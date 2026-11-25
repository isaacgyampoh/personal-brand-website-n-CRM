import { z } from "zod";
import { invalidate, TAGS } from "@/lib/cache";
import { verifySignedValue } from "@/lib/security/crypto";

/** Called by the background worker after scheduled publishing. Signed, short-lived token. */
export async function POST(request: Request) {
  const body = z.object({ tags: z.array(z.enum(Object.keys(TAGS) as [keyof typeof TAGS, ...(keyof typeof TAGS)[]])).max(10) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response("bad request", { status: 400 });
  const v = verifySignedValue(request.headers.get("x-internal-token") ?? "");
  if (v !== `revalidate:${body.data.tags.join(",")}`) return new Response("forbidden", { status: 403 });
  invalidate(...body.data.tags);
  return Response.json({ ok: true });
}
