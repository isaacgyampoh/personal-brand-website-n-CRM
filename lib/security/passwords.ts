import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// N=2^15, r=8, p=1 (~32 MiB). Format: scrypt$N$r$p$salt$hash
const N = 32768, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Basic strength policy: length matters most (NIST 800-63B). */
/** Very common passwords and patterns (lower-cased, without digits/symbols) that are refused outright. */
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "letmein", "welcome", "iloveyou", "admin", "administrator", "football",
  "monkey", "dragon", "sunshine", "princess", "abcdefghij", "abcdefgh", "trustno", "baseball", "superman", "starwars",
  "changeme", "secret", "login", "master", "freedom", "whatever", "ghana", "accra", "jesus", "blessed",
]);

export function passwordProblems(password: string, email?: string): string[] {
  const problems: string[] = [];
  const core = password.toLowerCase().replace(/[^a-z]/g, "");
  if (/^\d+$/.test(password) || COMMON.has(core) || /^(0123456789|1234567890|9876543210)/.test(password)) {
    problems.push("That password is too common. Use a few unrelated words or a password manager.");
  }
  if (password.length < 10) problems.push("Use at least 10 characters.");
  if (password.length > 200) problems.push("Use at most 200 characters.");
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase())) {
    problems.push("Don't include your email name in your password.");
  }
  if (/^(.)\1+$/.test(password)) problems.push("Avoid repeated characters.");
  return problems;
}
