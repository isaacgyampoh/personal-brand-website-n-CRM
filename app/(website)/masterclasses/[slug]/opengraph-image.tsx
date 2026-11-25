import { ImageResponse } from "next/og";
import { getPublicEvent } from "@/features/website/application/public-queries";
import { loadSettings } from "@/features/settings/application/settings";
import { formatInZone } from "@/lib/time";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Masterclass";

/** Generated social preview for shared event links (LinkedIn, X, WhatsApp). */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const [e, s] = await Promise.all([getPublicEvent((await params).slug), loadSettings()]);
  const title = e?.title ?? s.brand.name;
  const when = e ? formatInZone(new Date(e.startsAt), e.timezone, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: s.theme.ink, color: s.theme.paper }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: s.theme.accent }}>
          <div style={{ width: 56, height: 2, background: s.theme.accent }} />
          {e ? `${e.format === "online" ? "Live online" : "Live"} ${e.kind.replace("_", " ")}` : "Event"}
        </div>
        <div style={{ display: "flex", fontSize: title.length > 60 ? 62 : 78, lineHeight: 1.04, letterSpacing: -1.5, fontFamily: "serif", maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26 }}>
          <div style={{ display: "flex" }}>{when}</div>
          <div style={{ display: "flex", fontFamily: "serif", fontSize: 34 }}>{s.brand.name}</div>
        </div>
      </div>
    ),
    size,
  );
}
