import { NextResponse } from "next/server";
import { unsubscribe } from "@/features/marketing/application/subscribers";

/** RFC 8058 one-click unsubscribe (POST from mail clients). GET shows the confirmation page. */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  await unsubscribe(token);
  return new Response("Unsubscribed", { status: 200 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(`/newsletter/unsubscribe?token=${encodeURIComponent(url.searchParams.get("token") ?? "")}`, url));
}
