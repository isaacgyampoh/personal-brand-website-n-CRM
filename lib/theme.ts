import { FONT_PAIRS } from "@/lib/fonts";
import type { Settings } from "@/features/settings/domain/schemas";

/** Design tokens from Studio (Business profile → Brand identity) as CSS custom properties. Values are schema-validated. */
export function themeVars(t: Settings["theme"]): Record<string, string> {
  const pair = FONT_PAIRS[t.fontPair] ?? FONT_PAIRS.signature;
  return {
    "--ink": t.ink, "--paper": t.paper, "--surface": t.surface, "--brand-accent": t.accent, "--brand-accent-ink": t.accentInk,
    "--muted-ink": t.muted, "--deep": t.deep, "--highlight": t.highlight,
    "--site-display": pair.display, "--site-body": pair.body, "--display-scale": String(pair.displayScale), "--display-weight": String(pair.displayWeight),
    "--site-radius": t.corners === "soft" ? "6px" : "0px",
  };
}

/** `selector{--ink:…;…}` for a <style> tag. */
export function themeCss(t: Settings["theme"], selector = ":root"): string {
  return `${selector}{${Object.entries(themeVars(t)).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
