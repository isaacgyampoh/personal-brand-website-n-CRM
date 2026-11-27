# Progress tracker

Legend: ✅ done & tested · 🟡 implemented, not verified against the live external service · ⛔ blocked / not done

| Area | Status | Notes |
|---|---|---|
| Supabase removed; standard PostgreSQL | ✅ | `db/` migrations, RLS + PUBLIC revoked, least-privilege role, private Postgres in compose |
| Authentication, staff MFA, recent auth, first-admin provisioning, recovery | ✅ | TOTP (replay-protected), recovery codes, shell-only provisioning & MFA reset |
| Integration Centre (8 providers, encrypted, statuses, tests, rotation) | ✅ / 🟡 | Store, vault, UI, SSRF guard tested; each provider's live connection 🟡 until credentials are supplied |
| Paystack | ✅ / 🟡 | Logic tested with a test double + HMAC; live API 🟡 |
| Hubtel | 🟡 | Adapter, signed callbacks, status check, manual refunds; offline tests only |
| Google Calendar & Meet, Zoom | 🟡 | Implemented against public APIs; no credentials to verify |
| SMTP, R2, mNotify, AI | 🟡 | Runtime config + connection tests; no credentials to verify |
| Website & management | ✅ | Puck studio, content studio, media (crop, focal point, usage), link-in-bio, SEO/OG |
| Bookings | ✅ | Africa/Accra default, DB double-booking protection, Google busy-time feed |
| Masterclasses | ✅ | One-screen quick create (flyer, mode, price, early bird, seats, deadline, Zoom/Meet/link), preview, publish, share, OG preview, waitlist, comps, duplication |
| Portal | ✅ | Appointments, classes, courses, downloads, receipts, certificates |
| Emails | ✅ / 🟡 | Templates, queue, dev sink tested; real SMTP 🟡 |
| Finance | ✅ | Ledger-based reports, filters, by provider/type/item, CSV + XLSX, reconciliation, audited manual payments, Hubtel refund confirmation |
| Business improvements | ✅ | Campaign links, link-in-bio, enquiries→opportunities/tasks, testimonial requests + moderation, follow-ups, discount codes, ICS export, branded receipts, configurable certificates, global search, activity centre, onboarding checklist |
| Performance | ✅ | Mobile LCP 2.8 s → 2.3–2.5 s (Lighthouse 12, 4 pages); desktop 0.5–0.7 s |
| Backups | ✅ / 🟡 | Encrypted, manifest, verified restore (27/27 checks incl. credential decryption), live-DB refusal; off-site upload code 🟡 (no backup bucket credentials) |
| Tests | ✅ | 116 Vitest (unit + integration on real PostgreSQL) + 47 Playwright (desktop + mobile, axe) |
| Staging deployment on Contabo | ⛔ | No project-specific server/Docker/GitHub/DNS access provided |
