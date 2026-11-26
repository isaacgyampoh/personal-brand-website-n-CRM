import { db } from "@/lib/database/pool";
import { NextResponse } from "next/server";
import { localProvider } from "@/lib/auth/local-provider";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { safeNext } from "@/lib/auth/safe-next";

/** Consumes a single-use magic link (local auth provider) and signs the user in. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const r = await localProvider.consumeMagicLink(url.searchParams.get("token") ?? "");
  if (!r.ok) return NextResponse.redirect(new URL("/login?error=link", url));
  const next = safeNext(url.searchParams.get("next"), "/portal");
  const mfa = await db.one("select 1 from users where id = $1 and mfa_enabled_at is not null", [r.userId]);
  if (mfa) return NextResponse.redirect(new URL(`/login/mfa?next=${encodeURIComponent(next)}`, url));
  await attachVerifiedUser(r.userId);
  return NextResponse.redirect(new URL(next, url));
}
