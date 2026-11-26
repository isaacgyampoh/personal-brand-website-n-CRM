import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { completeGoogleConnect } from "@/features/integrations/application/google";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("settings:manage")) return new Response("Forbidden", { status: 403 });
  try {
    await completeGoogleConnect(url.searchParams.get("code") ?? "", url.searchParams.get("state") ?? "", user.id);
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=connected#google", url));
  } catch (e) {
    console.error("[google]", (e as Error).message);
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=error#google", url));
  }
}
