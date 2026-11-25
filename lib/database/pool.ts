import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/config/env";

// bigint (int8) → number. Money values are minor units and stay far below 2^53.
types.setTypeParser(20, (v) => Number(v));
// numeric → number (used only for aggregates such as averages/percentages)
types.setTypeParser(1700, (v) => Number(v));

/** Minimal executor port. Use cases depend on this, not on `pg` directly. */
export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
}

const globalForPool = globalThis as unknown as { __brandPool?: Pool };

function pool(): Pool {
  if (!globalForPool.__brandPool) {
    const e = env();
    globalForPool.__brandPool = new Pool({
      connectionString: e.DATABASE_URL,
      max: e.DATABASE_POOL_MAX,
      ssl: e.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "brand-platform",
    });
    globalForPool.__brandPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return globalForPool.__brandPool;
}

function wrap(runner: { query: PoolClient["query"] }): Db {
  return {
    async query(sql, params) {
      const res = await runner.query(sql, params as unknown[]);
      return res.rows;
    },
    async one(sql, params) {
      const res = await runner.query(sql, params as unknown[]);
      return res.rows[0] ?? null;
    },
  };
}

export const db: Db = {
  query: (sql, params) => wrap(pool()).query(sql, params),
  one: (sql, params) => wrap(pool()).one(sql, params),
};

/**
 * Run work in a transaction. Retries automatically on serialization failures
 * and deadlocks (40001/40P01) which can occur under concurrent booking load.
 */
export async function tx<T>(work: (t: Db) => Promise<T>, opts: { retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const client = await pool().connect();
    try {
      await client.query("begin");
      const result = await work(wrap(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const code = (error as { code?: string }).code;
      if ((code === "40001" || code === "40P01") && attempt < retries) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1) + Math.random() * 30));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function closePool() {
  await globalForPool.__brandPool?.end();
  globalForPool.__brandPool = undefined;
}
