# Migration: earlier Supabase-based build → standard PostgreSQL

The first delivery supported Supabase (database + optional Supabase Auth). This delivery removes Supabase entirely.

## What changed

| Area | Before | Now |
|---|---|---|
| Migrations | `supabase/migrations`, `supabase/seed.sql`, created `anon`/`authenticated` roles | `db/migrations`, `db/seed.sql`; no Supabase roles; RLS enabled + privileges revoked from `PUBLIC` |
| Authentication | `AUTH_PROVIDER=supabase\|local` | Built-in only (sessions in PostgreSQL) + staff TOTP MFA; `/auth/confirm` removed |
| Integration credentials | Environment variables (`PAYSTACK_*`, `SMTP_*`, `R2_*`, `GOOGLE_*`, `ZOOM_*`, `MNOTIFY_*`, `ANTHROPIC_API_KEY`) | Studio → Integrations, encrypted in `integration_configs`; env keeps infrastructure secrets only |
| Storage | `STORAGE_DRIVER=r2\|local` | R2 when connected in the Integration Centre, otherwise local disk (development; staging with explicit opt-in) |
| Payments | Paystack | Paystack (primary) + Hubtel (optional), provider recorded per payment |
| Google | `integrations` table, calendar sync only | Integration Centre OAuth, calendar selection, busy-time sync, invitations, Meet |
| Database hosting | Supabase project | Private PostgreSQL container on the Contabo server (or a new dedicated database on an existing server) |

No production data existed in the earlier build, so no data migration was required. Migration `20261127000010_integration_centre.sql` drops the old `integrations` table (it only held optional OAuth tokens).

## If an environment from the earlier build exists

1. Back it up (`scripts/backup.sh`).
2. Restore into the new private PostgreSQL (`scripts/restore.sh` into an **empty** database), then run `npx tsx scripts/migrate.ts` (applies migration 10).
3. Users from Supabase Auth: there were none in production. For any test users, ask them to use "Forgot password?" once (built-in auth).
4. Re-enter integration credentials in Studio → Integrations (old env variables are ignored), run **Test connection** for each.
5. Remove the old Supabase project when satisfied.
