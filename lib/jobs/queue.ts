import "server-only";
import { db, type Db } from "@/lib/database/pool";

export type JobRow = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export type EnqueueOptions = {
  runAt?: Date;
  maxAttempts?: number;
  /** Duplicate enqueues with the same key are ignored (idempotent scheduling). */
  idempotencyKey?: string;
};

export async function enqueue(
  type: string,
  payload: Record<string, unknown> = {},
  opts: EnqueueOptions = {},
  executor: Db = db,
): Promise<number | null> {
  const row = await executor.one<{ id: number }>(
    `insert into jobs (type, payload, run_at, max_attempts, idempotency_key)
     values ($1, $2, coalesce($3, now()), $4, $5)
     on conflict (idempotency_key) do nothing
     returning id`,
    [type, JSON.stringify(payload), opts.runAt ?? null, opts.maxAttempts ?? 5, opts.idempotencyKey ?? null],
  );
  return row?.id ?? null;
}

/** Atomically claims up to `limit` due jobs. Safe with multiple workers. */
export async function claimJobs(workerId: string, limit = 5): Promise<JobRow[]> {
  return db.query<JobRow>(
    `update jobs set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
      where id in (
        select id from jobs where status = 'pending' and run_at <= now()
        order by run_at limit $2 for update skip locked)
      returning id, type, payload, attempts, max_attempts`,
    [workerId, limit],
  );
}

export async function completeJob(id: number): Promise<void> {
  await db.query(
    `update jobs set status = 'completed', completed_at = now(), locked_at = null, locked_by = null, last_error = null where id = $1`,
    [id],
  );
}

/** Exponential backoff with jitter: 30s, 2m, 8m, 32m … capped at 6h. */
export function backoffSeconds(attempt: number): number {
  const base = Math.min(30 * 4 ** (attempt - 1), 6 * 3600);
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

export async function failJob(job: JobRow, error: unknown): Promise<"retry" | "dead"> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  if (job.attempts >= job.max_attempts) {
    await db.query(
      `update jobs set status = 'dead', last_error = $2, locked_at = null, locked_by = null where id = $1`,
      [job.id, message],
    );
    return "dead";
  }
  await db.query(
    `update jobs set status = 'pending', last_error = $2, locked_at = null, locked_by = null,
       run_at = now() + make_interval(secs => $3) where id = $1`,
    [job.id, message, backoffSeconds(job.attempts)],
  );
  return "retry";
}

/** Recovers jobs left 'running' by a crashed worker (restart recovery). */
export async function releaseStaleJobs(staleAfterSeconds = 600): Promise<number> {
  const rows = await db.query(
    `update jobs set status = 'pending', locked_at = null, locked_by = null,
       last_error = coalesce(last_error, '') || ' [recovered after worker interruption]'
     where status = 'running' and locked_at < now() - make_interval(secs => $1)
     returning id`,
    [staleAfterSeconds],
  );
  return rows.length;
}

export async function retryJob(id: number): Promise<void> {
  await db.query(
    `update jobs set status = 'pending', run_at = now(), max_attempts = greatest(max_attempts, attempts + 1)
     where id = $1 and status in ('dead','failed','cancelled')`,
    [id],
  );
}

export async function cancelJob(id: number): Promise<void> {
  await db.query(`update jobs set status = 'cancelled' where id = $1 and status = 'pending'`, [id]);
}
