import { NextResponse } from "next/server";
import { localProvider } from "@/lib/auth/local-provider";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { safeNext } from "@/lib/auth/safe-next";

/** Consumes a single-use magic link (local auth provider) and signs the user in. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const r = await localProvider.consumeMagicLink(url.searchParams.get("token") ?? "");
  if (!r.ok) return NextResponse.redirect(new URL("/login?error=link", url));
  await attachVerifiedUser(r.userId);
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next"), "/portal"), url));
}
