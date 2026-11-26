import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "@/lib/config/env";

/**
 * SSRF protection for endpoints the client can configure (SMTP host, custom
 * provider URLs). Rejects hosts that resolve to loopback, private, link-local,
 * carrier-grade NAT, multicast or reserved ranges — so a stolen admin session
 * can't point the server at internal services (database, Docker API, cloud
 * metadata). Operators may allow specific private hosts via ALLOWED_PRIVATE_HOSTS.
 */
export class UnsafeHostError extends Error {}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function ipv6Private(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return ipv4Private(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? ipv6Private(ip) : ipv4Private(ip);
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host.length > 253 || /[\s/@]/.test(host)) throw new UnsafeHostError("Enter a valid hostname.");
  const allowed = (env().ALLOWED_PRIVATE_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allowed.includes(host)) return;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeHostError("Private or local hosts are not allowed.");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new UnsafeHostError(`Could not resolve ${host}.`);
  });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeHostError(`${host} resolves to a private or reserved address, which is not allowed.`);
  }
}

export async function assertPublicHttpsUrl(url: string, allowedHostSuffixes?: string[]): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UnsafeHostError("Enter a valid URL.");
  }
  if (u.protocol !== "https:") throw new UnsafeHostError("Only https:// URLs are allowed.");
  if (u.username || u.password) throw new UnsafeHostError("URLs must not contain credentials.");
  if (allowedHostSuffixes && !allowedHostSuffixes.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`))) {
    throw new UnsafeHostError(`The host must be on ${allowedHostSuffixes.join(" or ")}.`);
  }
  await assertPublicHost(u.hostname);
  return u;
}
