# Delivery report — Final Delivery Directive

Date: 27 November 2026 · Branch `main` · All work committed (no remote push: no GitHub access was provided).

## Recommendation

| | Decision | Why |
|---|---|---|
| **Staging** | **GO** once project-specific server access is provided | Code, tests, build, containers and runbooks are ready. Staging is **not deployed**. |
| **Production / live payments** | **NO-GO** | Not deployed; no provider credentials verified (Paystack, SMTP, R2…); client content not supplied; no external penetration test. |

## URLs

| | URL |
|---|---|
| Staging / public / Studio / portal | **None yet.** No Contabo SSH, Docker, DNS or GitHub access was supplied for this project. Access belonging to other projects was refused by the environment's permission checks and was not worked around. After deployment: `https://<staging-host>/`, `/admin` (Studio), `/portal`. |

## What was done in this phase

**Priority 0**
- **Supabase removed completely** — no Supabase code, config, roles, migrations folder or docs remain. Standard PostgreSQL migrations in `db/`; RLS on and all privileges revoked from `PUBLIC`; private PostgreSQL container (no published port) with a least-privilege `brand_app` role.
- **Authentication** — built-in sessions; **staff TOTP MFA** (replay-protected, recovery codes, enforced in production: staff without MFA hold no permissions); **recent re-authentication** for credentials, team/roles, refunds and offline payments; **shell-only first-admin provisioning** via a single-use set-password link; MFA recovery reset from the shell; common-password denylist.
- **Integration Centre** (Studio → Integrations) for Paystack, Hubtel, Google Calendar/Meet, Zoom, SMTP, R2, mNotify, AI: forms, masked secrets, setup steps, copyable webhook/callback/redirect URLs, test/live modes, enable/disable, real connection tests, last success/failure, the six required statuses — **"Connected" only when the exact current configuration passed a real test**. AES-256-GCM vault, master keys outside PostgreSQL, key versioning + rotation script, audit without values, SSRF guard.
- **Paystack** — resolved from the encrypted store without redeploys; separate test/live keys; channels; verification of reference/amount/currency through the creating provider only; live mode locked behind `PAYMENTS_LIVE_APPROVED`.
- **Masterclasses** — one-screen quick create (title, summary, flyer upload, date/duration, online/in-person/hybrid, Zoom/Meet/pasted link, free/paid, seats, early bird, registration deadline, waitlist) → ready page with preview, publish, copy link, WhatsApp/LinkedIn share links, tracked campaign link and OG preview; staff-only draft preview; OG/Twitter images from the flyer.
- **Media** — focal point, cropped copies (16:9, link preview, square, portrait), responsive variants, storage usage.

**Priority 1**: Hubtel adapter (signed callbacks + mandatory status check, manual refund confirmation), Google Calendar (OAuth, calendar selection, busy-time sync into availability, invitations, Meet), Zoom (S2S OAuth meetings for bookings and masterclasses, update on reschedule, delete on cancel, manual fallback), **Finance** (ledger-based received/refunded/net/pending, by provider/type/item, filtered transactions, CSV + Excel), global search, activity centre, data-derived launch checklist, testimonial requests to verified clients, consented abandoned-checkout reminders, branded receipts with logo, configurable certificates, payment-provider selection.

**Reliability & performance**: encrypted backups with business manifest, verified restore tests, live-DB refusal, verified off-site copy code with retention, Studio alert on failure; mobile LCP improved; hydration bug fixed; export-prefetch bug fixed.

## Test results (all on real PostgreSQL; none skipped)

| Suite | Result |
|---|---|
| Vitest unit + integration | **117 / 117 passed** (65 original + 52 new: vault, TOTP RFC vectors, SSRF, status rules, Hubtel request/response mapping, Integration Centre store, provider isolation, Hubtel callback tokens, manual refunds, MFA replay & recovery, key rotation, quick create, finance + XLSX, search/activity scoping, onboarding, testimonial requests, abandoned checkout, media crop/EXIF, branded certificates, password policy) |
| Playwright E2E (desktop + Pixel 7, axe) | **47 / 47 passed** on a fresh dev server (41 original + 6 new: MFA enrol & recovery sign-in, Integration Centre secret handling/SSRF/status, quick masterclass → public page, finance/search/activity + no export prefetch, Studio on a phone). One earlier run had 33 failures caused by a stale dev server after production rebuilds; restarted and re-ran: all pass. |
| Public E2E against the **production build** | 32 / 32 passed |
| Typecheck / lint / production build | Pass / 0 errors (14 warnings) / Pass |
| Hydration | No errors in en-US/New York and fr-FR/Paris browsers on 5 key pages |

## Integration status

| Integration | Status |
|---|---|
| PostgreSQL | **Working** locally (PG 18) incl. migrations, constraints, backups, restore. Production container config written, **not run** (no server). |
| Paystack | Implemented & tested with a test double / HMAC vectors. **Not verified with Paystack** (no test keys). |
| Hubtel | Implemented from published API descriptions (docs unreachable). **Unverified**; locked until live approval. |
| Google Calendar | Implemented. **Unverified** (no OAuth client). |
| Google Meet | Implemented via Calendar conferenceData. **Unverified.** |
| Zoom | Implemented. **Unverified** (no S2S app). |
| Email (SMTP) | Implemented; dev mail sink tested; SSRF refusal tested. **Unverified with a real SMTP account.** |
| R2 | Implemented with write/read/delete test. **Unverified** (no credentials). |
| mNotify / AI | Implemented. **Unverified.** |

No integration is shown or reported as Connected without a real passing test.

## Backup evidence (local)

`backup.sh` → 304 KB encrypted dump + checksum + encrypted manifest. Restore into the live DB → **REFUSED**. Wrong passphrase → fails. `verify-backup.sh` into a throwaway DB → **27/27 checks**: all 81 tables' row counts, ledger 15000→15000, paid orders, receipts, no orphans, ledger = total − refunds per order, double-booking constraint and immutability triggers present, owner account + scrypt hashes, **stored integration credential decrypts with the master key**. Wrong master key → detected (26/27). Scratch DBs left: 0. Off-site upload and the server cron: **not exercised** (no backup bucket/server).

## Security

See [SECURITY.md](SECURITY.md) for the full checklist (auth bypass, escalation, IDOR, payment manipulation, webhooks, double booking/overselling, access control, credential leakage, uploads, XSS, CSRF, SQLi, rate limiting, unsafe endpoints). Findings fixed this phase: React hydration mismatch from browser-locale formatting; export routes prefetched by `next/link` (exports generated and audited on page view); `recordTestResult` failure path SQL bug (found by tests). `pnpm audit --prod`: **0 known vulnerabilities** (1 moderate in a dev-only CLI). No external penetration test was run.

## Performance (Lighthouse 12, production build, simulated mobile 4G)

| Page | Mobile LCP (before → after) | Mobile perf | Desktop LCP |
|---|---|---|---|
| Home | 2.8 → **2.5 s** | 98 | 0.6 s |
| Masterclass | 2.8 → **2.5 s** | 98 | 0.7 s |
| Article | 2.8 → **2.3 s** | 98 | 0.5 s |
| Booking | 2.8 → **2.3 s** | 98 | 0.6 s |

Changes: public pages get their own stylesheet (55 KB vs 123 KB raw), single display-font weight. Accessibility 100; SEO 63–66 only because staging is deliberately `noindex`; Best Practices 96 on the masterclass page was the hydration error, fixed afterwards (verified in browsers, Lighthouse not re-run). Lab measurement on demo content — re-measure with real photography on staging.

## Screenshots

`docs/screenshots/` (production build): public home, masterclass, booking and link-in-bio (desktop + mobile); Studio dashboard, Integrations, quick masterclass and finance (desktop + mobile); launch checklist, activity, security and media (desktop).

## Admin onboarding procedure

[ADMIN-ONBOARDING.md](ADMIN-ONBOARDING.md): operator runs `create-owner` in the tools container → single-use link (60 min) → client sets password → enrols MFA and saves recovery codes → follows Studio → Get started.

## What's still needed

**Access (operator):** project-specific SSH to the Contabo server (or a deploy user), the shared proxy network name, a staging hostname + DNS record, a GitHub remote for this repository.

**Credentials (client, entered in Studio):** Paystack test keys (later live keys + business verification), SMTP account for the sending domain (+ SPF/DKIM/DMARC), Cloudflare R2 buckets + token, optional Google OAuth client, Zoom S2S app, Hubtel API access + IP whitelisting, mNotify key + approved sender ID, Anthropic key. **Operator only:** a dedicated R2 backup bucket + scoped token, `BACKUP_PASSPHRASE`, master keys stored offline.

**Client information:** final brand name, title, bio, portrait and photography, logo, services and prices, masterclass flyers, real testimonials with consent, legal name/address for receipts, lawyer-reviewed privacy policy and terms, refund/cancellation policies.

## Go-live checklist

1. Staging deployed over HTTPS; health check and backup job green; a verified restore test on the server.
2. Every required integration shows **Connected**; one Paystack test payment, webhook and refund end-to-end.
3. Client content entered; demo content removed (launch checklist shows it).
4. External security review; `PAYMENTS_LIVE_APPROVED=true` and live keys only with the client's written approval; one small real payment and refund.
5. Production DNS switch with approval; enable indexing.
