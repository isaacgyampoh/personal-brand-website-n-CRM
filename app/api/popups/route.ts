import { NextResponse } from "next/server";
import { popupsForPath } from "@/features/popups/application/popups";

/** Pop-up candidates for one public page, highest priority first. Never errors — a pop-up must not break the site. */
export async function GET(request: Request) {
  const path = (new URL(request.url).searchParams.get("path") ?? "/").slice(0, 300);
  try {
    if (!path.startsWith("/")) return NextResponse.json({ popups: [] });
    return NextResponse.json({ popups: await popupsForPath(path.split("?")[0]) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[popups]", (e as Error).message);
    return NextResponse.json({ popups: [] });
  }
}
