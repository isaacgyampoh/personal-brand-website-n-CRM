# Progress tracker

Legend: ✅ done & tested · 🟡 implemented, not verified against the live external service · ⛔ blocked / not done

| Phase | Status | Notes |
|---|---|---|
| 1 Foundation | ✅ | Next.js 16, strict TS, 9 SQL migrations, RLS, roles/permissions, auth (local ✅ / Supabase 🟡), design system |
| 2 Premium website | ✅ | 23-block editorial library, 25+ public routes, mobile nav, SEO, structured data, OG images |
| 3 Website management | ✅ | Puck studio (drafts, autosave, publish, schedule, revisions, viewports, SEO), Tiptap content studio, media library |
| 4 CRM & appointments | ✅ | Contacts, pipeline Kanban, tasks, segments, CSV/XLSX import, export, duplicates/merge; availability engine, booking, cancel/reschedule, admin overrides |
| 5 Masterclasses & payments | ✅ / 🟡 | Events, tickets, early bird, waitlist, sessions, resources, access, check-in, certificates; order/payment/refund/ledger/reconciliation logic ✅ with a test double; Paystack API 🟡 |
| 6 Portal & academy | ✅ | Portal, class pages, course player, quizzes, assignments, drip, certificates, downloads, receipts |
| 7 Marketing & growth | ✅ / 🟡 | Newsletter double opt-in, campaigns, tracked links & attribution, discounts, assessments, partnerships, AI assistant 🟡 |
| 8 Automation & reliability | ✅ | PostgreSQL job queue, worker, reminders, follow-ups, reconciliation, expiry, retention, backup/restore tested |
| 9 QA | ✅ | 65 unit/integration + 41 E2E passing; Lighthouse; axe; dependency audit |
| 10 Deployment prep | 🟡 | Dockerfile, compose, Caddy, deploy/rollback/backup scripts written; **not built/run** (no Docker, no server access) |

## Open items

- ⛔ Credentials needed: Supabase project, Paystack test keys, SMTP, R2, (optional) Google OAuth, mNotify, Anthropic key, Contabo SSH.
- ⛔ Client content: brand identity, photography, biography, services/prices, legal text (lawyer-reviewed), testimonials with consent.
- TOTP MFA for built-in auth; automatic Zoom meeting creation; image cropping UI in the media library; XLSX export (CSV only); PDF invoices separate from receipts.
