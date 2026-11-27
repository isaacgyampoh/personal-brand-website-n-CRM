import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";

export const ATTR_COOKIE = "bp_attr";

const attrSchema = z.object({
  linkId: z.string().uuid().optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_content: z.string().max(100).optional(),
  landing: z.string().max(300).optional(),
  at: z.string().max(40).optional(),
  /** Website pop-up whose button the visitor clicked last (Studio → Pop-ups analytics). */
  popupId: z.string().uuid().optional(),
  popupAt: z.string().max(40).optional(),
});
export type Attribution = z.infer<typeof attrSchema>;

/** First-party campaign attribution captured from tracked links / UTM landings. */
export async function currentAttribution(): Promise<Attribution> {
  const raw = (await cookies()).get(ATTR_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = attrSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function encodeAttribution(a: Attribution): string {
  return Buffer.from(JSON.stringify(a)).toString("base64url");
}
