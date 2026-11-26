import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleConnectUrl } from "@/features/integrations/application/google";
import { hasRecentAuth } from "@/lib/auth/reauth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("settings:manage")) return new Response("Forbidden", { status: 403 });
  if (!(await hasRecentAuth())) return NextResponse.redirect(new URL("/admin/settings/integrations?reauth=1#google", request.url));
  try {
    return NextResponse.redirect(await googleConnectUrl(user.id));
  } catch {
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=error#google", request.url));
  }
}
