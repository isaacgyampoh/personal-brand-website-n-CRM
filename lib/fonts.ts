import { Cormorant_Garamond, Fraunces, Geist, Instrument_Serif, Inter, Manrope, Playfair_Display, Source_Sans_3 } from "next/font/google";

// Signature (default): Fraunces (variable) + Manrope
export const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" });
// Editorial: Cormorant Garamond + Manrope
export const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-cormorant", display: "swap", preload: false });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
// Classic: Playfair Display + Source Sans 3 (not preloaded unless selected)
export const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap", preload: false });
export const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap", preload: false });
// Modern: Instrument Serif + Inter
export const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap", preload: false });
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
// Admin / portal UI
export const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap", preload: false });

export const fontVariables = [fraunces, cormorant, manrope, playfair, sourceSans, instrument, inter, geist].map((f) => f.variable).join(" ");

export const FONT_PAIRS = {
  signature: { display: "var(--font-fraunces)", body: "var(--font-manrope)", displayScale: 0.9, displayWeight: 450 },
  editorial: { display: "var(--font-cormorant)", body: "var(--font-manrope)", displayScale: 1.08, displayWeight: 400 },
  classic: { display: "var(--font-playfair)", body: "var(--font-source-sans)", displayScale: 0.92, displayWeight: 400 },
  modern: { display: "var(--font-instrument)", body: "var(--font-inter)", displayScale: 1, displayWeight: 400 },
} as const;
