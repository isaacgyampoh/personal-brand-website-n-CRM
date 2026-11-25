import "server-only";
import { db } from "@/lib/database/pool";

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests. Please wait a moment and try again.");
  }
}

/**
 * Fixed-window rate limiter stored in PostgreSQL so it holds across
 * application instances and restarts.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const row = await db.one<{ hits: number }>(
    `insert into rate_limits (key, window_start, hits) values ($1, $2, 1)
     on conflict (key, window_start) do update set hits = rate_limits.hits + 1
     returning hits`,
    [key, windowStart],
  );
  if ((row?.hits ?? 0) > limit) {
    const retry = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000);
    throw new RateLimitError(retry);
  }
}
