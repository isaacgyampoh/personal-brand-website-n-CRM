/**
 * Portable migration runner. Applies supabase/migrations/*.sql in filename
 * order, each inside its own transaction, and records them in
 * public.schema_migrations. Works against Supabase Postgres (direct or session
 * pooler connection) and self-hosted PostgreSQL alike.
 *
 *   pnpm db:migrate            apply pending migrations
 *   pnpm db:migrate --status   list applied/pending
 *   pnpm db:migrate --seed     also apply supabase/seed.sql (idempotent)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { createHash } from "node:crypto";

const dir = join(process.cwd(), "supabase", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query(`create table if not exists public.schema_migrations (
      version text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const applied = new Map<string, string>(
      (await client.query("select version, checksum from public.schema_migrations")).rows.map((r) => [r.version, r.checksum]),
    );
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const statusOnly = process.argv.includes("--status");
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const sql = readFileSync(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prior = applied.get(version);
      if (prior) {
        if (prior !== checksum) console.warn(`! ${version} changed after being applied (checksum mismatch)`);
        if (statusOnly) console.log(`  applied  ${version}`);
        continue;
      }
      if (statusOnly) {
        console.log(`  pending  ${version}`);
        continue;
      }
      process.stdout.write(`→ applying ${version} … `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (version, checksum) values ($1, $2)", [version, checksum]);
        await client.query("commit");
        console.log("ok");
      } catch (error) {
        await client.query("rollback");
        console.log("FAILED");
        throw error;
      }
    }
    if (process.argv.includes("--seed")) {
      const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
      await client.query("begin");
      await client.query(seed);
      await client.query("commit");
      console.log("→ seed applied");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
