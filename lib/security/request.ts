import "server-only";
import { headers } from "next/headers";
import { anonymousHash } from "./crypto";
import { env } from "@/lib/config/env";

/** Client IP as seen behind Cloudflare/Caddy. Only ever stored hashed. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

export async function ipHash(): Promise<string> {
  return anonymousHash(await clientIp());
}

/**
 * CSRF defence for route handlers that accept cookies-authenticated POSTs.
 * Server Actions already enforce Origin checks in Next.js.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new Error("Missing Origin header");
  const allowed = new URL(env().APP_URL).origin;
  const self = new URL(request.url).origin;
  if (origin !== allowed && origin !== self) throw new Error("Cross-origin request rejected");
}

export function deviceFromUserAgent(ua: string | null): "mobile" | "tablet" | "desktop" | "bot" {
  if (!ua) return "desktop";
  if (/bot|crawler|spider|crawling|preview|headless|lighthouse|playwright|puppeteer|facebookexternalhit|linkedinbot|slurp/i.test(ua)) return "bot";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}
