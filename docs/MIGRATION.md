# Migrating from Supabase to self-hosted PostgreSQL (Contabo)

The application was built to make this a configuration change plus a data move, not a rewrite.

## What depends on Supabase

| Concern | Dependency | Portability |
|---|---|---|
| Database | Plain PostgreSQL via `pg` (`DATABASE_URL`) | Fully portable. Migrations are plain SQL (`supabase/migrations`), applied by our own runner; they create the `anon`/`authenticated` roles if missing. Extensions used: `citext`, `btree_gist`, `pgcrypto` (all standard). |
| Row Level Security | Enabled on every table with no policies; API roles have no privileges | Defence-in-depth only. The app connects as the table owner and enforces authorisation in server code, so RLS behaves identically (or can be left on) self-hosted. No policy uses `auth.uid()`. |
| Storage | Not used (Cloudflare R2) | Nothing to move. |
| Realtime / Edge Functions | Not used | — |
| **Authentication** | **Supabase Auth (GoTrue) when `AUTH_PROVIDER=supabase`** | **Needs migration work** — see below. |

## Database move

1. Freeze writes (maintenance banner, stop the worker).
2. `DATABASE_URL=<supabase> BACKUP_PASSPHRASE=… scripts/backup.sh ./backups`
3. Provision PostgreSQL 16+ on Contabo (or reuse the shared Postgres server with a **new database and role** — never reuse another project's database). Enable TLS or keep it on the private Docker network.
4. `TARGET_DATABASE_URL=<new> CONFIRM_RESTORE=yes BACKUP_PASSPHRASE=… scripts/restore.sh backups/<file>`
5. Verify row counts on key tables (the delivery report lists the query), run `npx tsx scripts/migrate.ts --status` (should be all applied), point `DATABASE_URL` at the new database, start the worker, run the smoke tests.

## Authentication options

User identities live in Supabase's `auth.users`; the app's own `users` table uses the **same UUID**, and every business record references `users.id`. Three options:

1. **Keep Supabase Auth** (simplest): only the database moves; auth stays on Supabase (`AUTH_PROVIDER=supabase`). Note the free project can still pause if auth is its only traffic.
2. **Switch to the built-in provider** (`AUTH_PROVIDER=local`): sessions move to the app's `sessions` table. Password hashes from Supabase are **bcrypt**; the built-in provider uses **scrypt**. Options: (a) ask users to sign in with an emailed magic link once and set a new password (no code changes — magic links create a session for the verified email); or (b) add bcrypt verification to `lib/security/passwords.ts` and re-hash to scrypt on first successful login, after exporting `encrypted_password` from `auth.users` into `users.password_hash` (requires database access to Supabase's `auth` schema). Existing Supabase sessions are invalidated either way; everyone signs in once more. Email verification state can be copied from `auth.users.email_confirmed_at` into `users.email_verified_at`.
3. **Self-hosted Supabase (GoTrue)**: possible, but runs several extra containers; only worth it if other Supabase features are needed.

Recommendation: option 2(a) — no password data leaves Supabase, and the flow is already implemented and tested.

## Checklist after migration

- `/api/health` returns ok; Admin → Jobs & logs shows a fresh worker heartbeat.
- Reconciliation page shows no high-severity issues.
- Nightly backup cron points at the new database; a test restore succeeds.
