import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleConnectUrl } from "@/features/integrations/application/google-calendar";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("settings:manage")) return new Response("Forbidden", { status: 403 });
  try {
    return NextResponse.redirect(googleConnectUrl(user.id));
  } catch {
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=error", request.url));
  }
}
