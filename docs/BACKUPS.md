# Backups, restore tests & disaster recovery

## What is protected

| Data | Where | How it is backed up |
|---|---|---|
| Everything in PostgreSQL (accounts & password hashes, MFA state, CRM, bookings, orders, ledger, receipts, content, settings, **encrypted** integration credentials) | `pgdata` volume | Nightly encrypted `pg_dump` + verified off-site copy |
| Media, course files, downloads | Cloudflare R2 (client's media bucket) | R2 durability; enable bucket versioning/lifecycle in Cloudflare. (Local `media` volume only during staging.) |
| `APP_SECRET`, `CREDENTIALS_MASTER_KEYS`, `BACKUP_PASSPHRASE` | Server env files | **Not in backups by design.** Kept in the client's password manager + an offline copy. |

Without `BACKUP_PASSPHRASE` a backup cannot be read. Without `CREDENTIALS_MASTER_KEYS` the restored database is complete, but integration credentials must be re-entered. Without the original `APP_SECRET`, passwords still work (hashes don't depend on it), but sessions, emailed links, MFA secrets and recovery codes become invalid — staff then re-enrol MFA via the reset procedure in [ADMIN-ONBOARDING.md](ADMIN-ONBOARDING.md).

## Nightly job (`deployment/backup-and-ship.sh`, cron in `deployment/backup.cron`)

1. `scripts/backup.sh` — `pg_dump` (custom format) of this app's database only → AES-256-CBC (PBKDF2, 200k iterations) → SHA-256 checksum → encrypted **manifest** of business totals (row counts for every table, ledger net, paid orders and totals, receipts, confirmed bookings/registrations, staff/MFA counts, stored credentials, last audit id). Local retention: newest 14.
2. `scripts/offsite.ts upload` — copies dump, checksum and manifest to a **dedicated** R2 bucket with a bucket-scoped token, then verifies size and checksum metadata.
3. `scripts/verify-backup.sh` — restores into a **throwaway database** and runs `scripts/verify-restore.ts`:
   - manifest values and every table's row count match;
   - relationships & money: no orphan ledger rows/items/enrolments/appointments/sessions, every paid order has a successful payment and a receipt, ledger total per order equals total − refunds, no confirmed registration on an unpaid order;
   - double-booking exclusion constraint and immutability triggers exist;
   - authentication: owner account present, all password hashes scrypt;
   - **every stored integration credential decrypts** with the operator's master key (values are never printed).
   The throwaway database is always dropped.
4. `scripts/offsite.ts prune` — removes off-site copies older than `REMOTE_KEEP_DAYS` (default 35) but always keeps the newest 7.
5. Any failure → a high-priority task in Studio ("Database backup failed") and an optional `HEALTHCHECK_URL/fail` ping.

`scripts/restore.sh` **refuses** to restore into the live database (compares database identity with `DATABASE_URL`/`LIVE_DATABASE_URL`) and refuses a target that already has accounts unless `FORCE_RESTORE_INTO_NONEMPTY=yes` (disaster recovery only).

## Evidence from this delivery (local PostgreSQL 18, dev database with demo data)

```
backup written: .data/backups/brand-20261127T001216Z.dump.enc (304K)   # + .sha256 + .manifest.enc
restore into live DB      → REFUSED: the target is the live database.
wrong passphrase          → pg_restore: error: input file does not appear to be a valid tar archive
verify-backup             → 27/27 checks passed  (81 tables match; ledger 15000 → 15000; paid orders 1 → 1;
                             receipts, relationships, constraints, owner auth OK; credentials decrypt: mnotify (key v1))
wrong master key          → FAIL credentials decrypt: mnotify … 26/27 checks passed
scratch databases left    → 0
```

Not yet exercised: the off-site upload (no backup R2 credentials were supplied) and the cron job on the real server.

## Restore drill (monthly, and before go-live)

```bash
cd /opt/brand-platform/deployment
docker compose --profile tools run --rm tools scripts/verify-backup.sh /backups/<file>.dump.enc
```

## Disaster recovery (server lost)

1. New server: install Docker, restore `deployment/secrets`, `.env.production`, `.env.backup` from the password manager.
2. `docker compose up -d postgres` (empty), then fetch the newest backup: `docker compose --profile tools run --rm tools npx tsx scripts/offsite.ts list` and download it.
3. Inside the tools container: `TARGET_DATABASE_URL=<new, empty app database> CONFIRM_RESTORE=yes scripts/restore.sh <file>`, then run `verify-backup.sh` on the same file.
4. `deployment/deploy.sh`. Staff sign in as before (password hashes and MFA restored); integrations work if the same `CREDENTIALS_MASTER_KEYS` was restored.
