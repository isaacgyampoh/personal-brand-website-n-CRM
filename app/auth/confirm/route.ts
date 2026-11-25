import { NextResponse } from "next/server";
import { authProvider } from "@/lib/auth/session";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { safeNext } from "@/lib/auth/safe-next";

/** Supabase email links (signup / magic link / recovery) land here with token_hash + type. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type");
  const provider = authProvider();
  const r = type === "magiclink" || type === "recovery" ? await provider.consumeMagicLink(tokenHash) : await provider.verifyEmail(tokenHash);
  if (!r.ok) return NextResponse.redirect(new URL("/login?error=link", url));
  await attachVerifiedUser(r.userId);
  return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : safeNext(url.searchParams.get("next"), "/portal"), url));
}
