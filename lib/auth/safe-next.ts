/** Only allow same-site relative redirects (prevents open redirects). */
export function safeNext(next: unknown, fallback: string): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
