import { NextResponse } from "next/server";
import { authProvider } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  await authProvider().signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
