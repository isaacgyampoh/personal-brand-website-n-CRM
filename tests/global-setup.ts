import { execSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "./env";

/** Recreates an isolated test database and applies all migrations + seed. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/_test$/.test(name)) throw new Error(`Refusing to reset non-test database "${name}"`);
  const admin = new Client({ connectionString: TEST_DATABASE_URL.replace(`/${name}`, "/postgres") });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  execSync("npx tsx scripts/migrate.ts --seed", { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "inherit" });
}
