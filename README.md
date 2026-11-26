# Personal Brand & Coaching Platform

One application that runs a coach / consultant / speaker's whole business:

- **Public website** — editorial, mobile-first brand site: services, booking, masterclasses, academy, shop, insights, speaking, case studies, press, testimonials, brand assessment, link-in-bio, legal pages.
- **Studio (admin CRM)** — dashboard, contacts & pipeline, bookings & availability, masterclasses, payments & reconciliation, visual website builder, content studio & calendar, media library, academy & shop, marketing (campaigns, tracked links, discount codes), assessments, partnerships, analytics, settings, team & roles, jobs & audit log, optional AI drafting assistant.
- **Customer & student portal** — appointments, protected class pages, courses with progress and quizzes, downloads, receipts, certificates, profile.

Built for **one client** (not multi-tenant), structured so it can grow into a product later.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui (admin) · PostgreSQL (Supabase or self-hosted) · Supabase Auth *or* built-in auth · Paystack · Cloudflare R2 · SMTP · Puck (visual editor) · Tiptap · Zod · Recharts · Vitest · Playwright · Docker + Caddy.

## Architecture (lightweight clean architecture)

```
features/<module>/
  domain/          pure business rules (availability, pricing, scoring, capacity rules) — no I/O
  application/     use cases (book, register, checkout, fulfil, refund, publish…)
  infrastructure/  SQL repositories & provider adapters (Paystack, SMTP, mNotify, Google)
  presentation/    server actions (validated with Zod, permission-checked)
app/               routes: (website) · (authentication) · admin · studio · portal · api
components/        website · dashboard · editor · portal · shared
lib/               database, auth (provider port), storage (R2/local port), jobs, security, cache
supabase/          portable SQL migrations + seed
workers/           background worker (PostgreSQL job queue)
tests/             unit · integration (real Postgres) · e2e (Playwright)
deployment/        Dockerfile targets, docker-compose, Caddy snippet, deploy & backup scripts
docs/              setup, deployment, migration, security, Supabase Free notes, delivery report
```

Critical invariants live **in the database**: no double bookings (exclusion constraint), no overselling (locking capacity trigger), valid order state transitions, append-only ledger/audit/receipts, one receipt and one fulfilment per order, idempotent webhooks.

## Quick start (local development)

Requires Node 24, pnpm, PostgreSQL 15+.

```bash
pnpm install
cp .env.example .env.local        # then set APP_SECRET, DATABASE_URL, AUTH_PROVIDER=local, STORAGE_DRIVER=local
createdb brand_dev
pnpm db:seed                      # migrations + essential reference data
OWNER_PASSWORD='choose-a-long-password' pnpm create-owner --email you@example.com --name "Your Name"
pnpm db:demo                      # optional, clearly-labelled demonstration content
pnpm dev                          # http://localhost:3000  (admin at /admin)
pnpm worker                       # background jobs: emails, reminders, reconciliation, scheduled publishing
```

Without SMTP, development emails are written to `.data/mail/`. Without Paystack keys, paid checkout is disabled with an honest message (free bookings/registrations still work).

## Tests

```bash
pnpm test        # unit + integration (creates and resets a separate brand_test database)
pnpm test:e2e    # Playwright against a running dev server with demo data
pnpm typecheck && pnpm lint && pnpm build
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — configuring Supabase, Paystack, SMTP, R2, Google Calendar, AI, first owner, going live
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Contabo staging/production, backups, restore, rollback, monitoring
- [docs/SUPABASE-FREE.md](docs/SUPABASE-FREE.md) — verified free-tier limits, risks and mitigations
- [docs/MIGRATION.md](docs/MIGRATION.md) — moving from Supabase to self-hosted PostgreSQL (incl. auth)
- [docs/SECURITY.md](docs/SECURITY.md) — controls, threat notes, checks performed
- [docs/PROGRESS.md](docs/PROGRESS.md) — progress tracker
- [docs/DELIVERY-REPORT.md](docs/DELIVERY-REPORT.md) — what is done, tested, blocked, and the GO/NO-GO recommendation
