/**
 * Background worker: processes the PostgreSQL job queue and enqueues periodic
 * tasks. Runs as its own process/container, independent of any browser.
 *
 *   pnpm worker            (development)
 *   node dist/worker.js    (production image)
 *
 * Multiple workers are safe: jobs are claimed with FOR UPDATE SKIP LOCKED and
 * periodic tasks are de-duplicated by idempotency key per time bucket.
 */
import { hostname } from "node:os";
import { claimJobs, completeJob, enqueue, failJob, releaseStaleJobs } from "@/lib/jobs/queue";
import { closePool } from "@/lib/database/pool";
import { handlers, SCHEDULE } from "./handlers";

const workerId = `${hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
let stopping = false;
let active = 0;

async function schedulePeriodic() {
  const now = Date.now();
  for (const [type, minutes] of SCHEDULE) {
    const bucket = Math.floor(now / (minutes * 60_000));
    await enqueue(type, {}, { idempotencyKey: `${type}:${bucket}`, maxAttempts: 3 });
  }
}

async function runJob(job: Awaited<ReturnType<typeof claimJobs>>[number]) {
  active++;
  const started = Date.now();
  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    await handler(job.payload);
    await completeJob(job.id);
    if (!job.type.startsWith("cron.")) console.log(`[job ${job.id}] ${job.type} ok (${Date.now() - started}ms)`);
  } catch (error) {
    const outcome = await failJob(job, error);
    console.error(`[job ${job.id}] ${job.type} ${outcome}: ${(error as Error).message}`);
  } finally {
    active--;
  }
}

async function loop() {
  console.log(`[worker] ${workerId} started (concurrency ${CONCURRENCY})`);
  const recovered = await releaseStaleJobs();
  if (recovered) console.log(`[worker] recovered ${recovered} interrupted job(s)`);
  let lastSchedule = 0;
  let lastRecovery = Date.now();
  while (!stopping) {
    try {
      if (Date.now() - lastSchedule > 30_000) {
        await schedulePeriodic();
        lastSchedule = Date.now();
      }
      if (Date.now() - lastRecovery > 300_000) {
        await releaseStaleJobs();
        lastRecovery = Date.now();
      }
      const capacity = CONCURRENCY - active;
      const jobs = capacity > 0 ? await claimJobs(workerId, capacity) : [];
      for (const job of jobs) void runJob(job);
      if (jobs.length === 0) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (error) {
      console.error("[worker] loop error:", (error as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  while (active > 0) await new Promise((r) => setTimeout(r, 200));
  await closePool();
  console.log("[worker] stopped cleanly");
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, finishing in-flight jobs…`);
    stopping = true;
  });
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
