# Personal Brand & Coaching Platform

One application that runs a coach / consultant / speaker's whole business, for **one client** (not multi-tenant):

- **Public website** — editorial, mobile-first brand site: services & booking, masterclasses, academy, shop, insights, speaking, case studies, press, testimonials, brand assessment, link-in-bio, legal pages.
- **Studio (admin CRM)** — dashboard, activity centre, global search, launch checklist, contacts & pipeline, bookings & availability, masterclasses (incl. one-screen quick create), orders & payments, finance (reports, CSV/Excel), website builder, content studio, media library (crop & focal point), academy & shop, marketing, assessments, partnerships, analytics, **Integration Centre**, business settings, team & roles, security (MFA), jobs & audit log, optional AI drafting.
- **Customer & student portal** — appointments, protected class pages, courses, downloads, receipts, certificates, profile.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · standard **PostgreSQL** (private container on the Contabo server) · built-in authentication (scrypt, server-side sessions, TOTP MFA for staff) · **Paystack** (primary) and **Hubtel** (optional) · Cloudflare R2 · SMTP · Google Calendar & Meet · Zoom · mNotify (optional) · Claude (optional) · PostgreSQL job queue · Docker + the server's existing reverse proxy.

Not used, by design: Supabase, Flutterwave, NaloPay, .NET, WhatsApp API, multi-tenancy, SaaS billing, extra paid services.

## Architecture (lightweight clean architecture)

```
features/<module>/
  domain/          pure business rules (availability, pricing, capacity, status rules) — no I/O
  application/     use cases (book, register, checkout, fulfil, refund, quick-create, finance…)
  infrastructure/  SQL repositories & provider adapters (Paystack, Hubtel, SMTP, mNotify, R2)
  presentation/    server actions (Zod-validated, permission-checked, recent-auth for sensitive changes)
lib/
  integrations/    Integration Centre definitions + encrypted store (credentials live in PostgreSQL, sealed with keys that don't)
  security/        vault (AES-256-GCM), TOTP, SSRF guard, rate limits, passwords
  auth/            sessions, MFA, recent authentication, permissions
app/               routes: (website) · (authentication) · admin · studio · portal · api
db/                plain SQL migrations + seed (applied by scripts/migrate.ts)
workers/           background worker (emails, reminders, reconciliation, calendar sync, meetings)
scripts/           migrate, provisioning, backups, restore verification, key rotation
deployment/        docker-compose (web, worker, private postgres, tools), deploy & backup jobs, proxy snippet
tests/             unit · integration (real PostgreSQL) · e2e (Playwright, desktop + mobile, axe)
```

Critical invariants live **in the database**: no double bookings (exclusion constraint), no overselling (locking capacity triggers), valid order transitions, append-only ledger/audit/receipts, one fulfilment per order, idempotent webhooks.

## Quick start (local development)

Requires Node 24, pnpm, PostgreSQL 16+.

```bash
pnpm install
cp .env.example .env.local     # set NODE_ENV=development, APP_URL=http://localhost:3000, APP_SECRET, DATABASE_URL,
                               # CREDENTIALS_MASTER_KEYS="1:$(openssl rand -base64 32)"
createdb brand_dev
pnpm db:seed                   # migrations + reference data
pnpm create-owner --email you@example.com --name "Your Name"   # prints a single-use set-password link
pnpm db:demo                   # optional, clearly-labelled demonstration content
pnpm dev                       # http://localhost:3000  (Studio at /admin)
pnpm worker                    # background jobs
```

Integrations are configured in **Studio → Integrations**, not in env files. Without SMTP, development emails are written to `.data/mail/`; without a verified payment provider, paid checkout shows an honest "not available" message and free flows still work.

## Tests

```bash
pnpm test         # unit + integration against a throwaway brand_test database
pnpm test:e2e     # Playwright (desktop + Pixel 7) against the dev server with demo data
pnpm typecheck && pnpm lint && pnpm build
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — local setup and configuring each integration
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — Integration Centre design, statuses, encryption, key rotation, verification status per provider
- [docs/ADMIN-ONBOARDING.md](docs/ADMIN-ONBOARDING.md) — first admin, MFA, staff, account recovery
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Contabo staging/production, isolation, rollback, monitoring
- [docs/BACKUPS.md](docs/BACKUPS.md) — encrypted backups, off-site copies, verified restore tests, disaster recovery
- [docs/SECURITY.md](docs/SECURITY.md) — controls and the security checks performed
- [docs/MIGRATION.md](docs/MIGRATION.md) — moving from the earlier Supabase-based build to standard PostgreSQL
- [docs/PROGRESS.md](docs/PROGRESS.md) — status tracker
- [docs/DELIVERY-REPORT.md](docs/DELIVERY-REPORT.md) — evidence-based delivery report and GO/NO-GO
