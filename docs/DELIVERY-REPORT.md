# Delivery report

Date: 2026-11-26 · Repository: this repo, branch `main` · Environment used: macOS, Node 24, PostgreSQL 18 (local), no Docker, no external credentials.

## 1. Features completed (built and exercised by automated tests)

**Public website** — home and CMS pages rendered from a validated 23-block library; services and service detail; booking (date → time in the visitor's time zone → details → review → confirm/pay); token-based "manage booking" (cancel/reschedule within policy); masterclass listing and landing pages (tickets, early bird windows, group places, waitlist, agenda, speakers, FAQs, Event structured data, generated social-preview image); academy and course pages; shop and product pages; insights with search, categories, tags, related articles; speaking (topics, engagements, enquiry); case studies (consent-gated); press/media with media-kit request; testimonials (approved + consent only) and submission form; contact with enquiry types; link-in-bio; brand assessment with deterministic scoring and consent-gated lead capture; certificate verification; newsletter double opt-in and one-click unsubscribe; legal pages flagged "requires legal review"; sitemap, robots, canonical URLs, noindex for private areas.

**Studio (admin)** — live-data dashboard with date filters and growth; contacts (filters, segments, lead score, timeline, notes, tags, tasks, consent, merge duplicates, anonymising delete), pipeline Kanban, CSV/XLSX import, CSV export; bookings week view, appointment detail (meeting link, notes, complete/no-show, reschedule, cancel with automatic refund), manual appointments, working hours, blocked dates/holidays/extra hours; services; masterclasses (create, publish, tickets, private joining info, multi-session/recurring, resources, attendees, manual/complimentary registration, check-in, export, certificates, duplicate, reschedule with notifications, cancel with automatic refunds); payments (orders, verify-now, manual payment with audit, refunds, receipts PDF, reconciliation report, ledger/orders exports); Website Studio (Puck visual editor, desktop/tablet/mobile preview, autosave drafts, publish, scheduled publish, revisions/restore, SEO & social settings, new landing pages); brand & design (colours, typography pairs, logo, SEO defaults), navigation/footer/announcement/link-in-bio editors; content studio (Tiptap, autosave, revisions, scheduling, SEO) and content calendar with reminders and copy-ready text; media library (drag-and-drop multi-upload, WebP conversion, metadata stripping, dedupe, public/private, reference-safe delete); academy (modules, lessons of 6 kinds, drip, previews, quiz builder, resources, students, manual enrolment, assignment review); shop (private files, download limits, lead magnets); marketing (campaigns to confirmed subscribers, tracked `/go/` links with clicks/leads/bookings/registrations/revenue attribution, UTM revenue, discount codes); assessments; partnerships pipeline and enquiries inbox; testimonials/case studies/press/speaking topics; analytics; settings (business, contact, social, checkout, email sender, features), email templates, team & role permissions, integrations status, jobs/notifications/audit log with retry/cancel; AI drafting assistant (off by default).

**Portal** — overview; appointments with self-service cancel/reschedule; masterclasses and protected class page (countdown, access window, materials, feedback, certificate); courses with progress, resume, quizzes, assignments; library downloads (signed, limited); receipts; certificates (PDF); profile, notification preferences, password reset, deletion request.

**Platform** — durable PostgreSQL job queue (SKIP LOCKED, backoff, dead-letter, idempotency keys, stale-lock recovery) and worker with 9 scheduled tasks; notifications log (accepted ≠ delivered); payment state machine; receipts; reconciliation; backups.

## 2. Partially completed

- **Supabase Auth adapter** — written against current `@supabase/ssr` APIs; not run against a real project.
- **Paystack** — adapter unit-tested (signatures, parsing, modes); full order/verify/webhook/refund flows tested with a test double; **no call to the real Paystack API has been made**.
- **R2 storage, SMTP, mNotify, Google Calendar, AI assistant** — implemented behind interfaces; unverified without credentials. Development uses local storage and file-based mail (clearly flagged, refused in production).
- **Zoom/Google Meet** — manual meeting links per event/service; no automatic meeting creation.
- **MFA** — not implemented for built-in auth (available via Supabase Auth).
- **Media** — no in-browser image cropping; responsive WebP variants are generated but pages currently serve the single optimised image.
- **Exports** — CSV (opens in Excel); no native XLSX export. Receipts are PDFs; separate pre-payment invoices are not generated.
- **Installments** — not implemented (discount codes and free/manual payments are).
- **Campaign scheduling** works; open-tracking is deliberately not implemented (privacy); click attribution uses tracked links.

## 3. Blocked by external dependencies

Supabase project credentials · Paystack test (later live) keys · SMTP account · Cloudflare R2 buckets/token · Contabo SSH access and the shared proxy network name · domain/Cloudflare access · optional Google OAuth client, mNotify key/sender ID, Anthropic API key · client brand content and lawyer-reviewed legal text.

## 4. Automated test results (actual, 2026-11-26)

`pnpm test` — **65/65 passed** (5 files): 27 unit (money, time zones incl. DST, availability engine, discounts, CSV injection, email escaping, Paystack signatures, builder validation, event rules, file sniffing, assessment scoring) + 38 integration against real PostgreSQL, including: 20 parallel bookings → exactly 1 succeeds; DB exclusion constraint rejects a raw overlapping insert; group capacity 3 of 6; 30 buyers for 5 seats → exactly 5; all-or-nothing group registration; expired holds don't count; event cancellation notifies; payment confirmed only after verification; tampered amount/currency rejected with no access granted; failed payment; invalid webhook rejected; duplicate/concurrent webhooks fulfil once (1 ledger row, 1 receipt, 1 email); webhook before settlement retried; late payment re-confirms or is flagged when sold out; idempotent refunds and access revocation; ledger/audit/receipt immutability; order transition enforcement; manual payment audit; entitlement isolation (unverified email gets nothing); draft vs published separation; unsafe block content rejected; scheduled page/article publishing; course progress → quiz graded server-side (answers never sent) → drip → certificate issued once and verifiable; job queue retries/dead-letter/restart recovery; idempotent email; unsubscribe suppression; CRM create/stage/merge/filter; CSV import dedupe with no assumed consent; rate limiting; password hashing; encryption; signed links.

## 5. Browser test results (actual)

`pnpm test:e2e` — **41/41 passed** (Chromium desktop 1440px + Pixel 7 mobile): 19 public pages render with no console errors and no horizontal overflow; no overflow at 320/375/768 px; mobile menu (open, Escape, navigate); sitemap/robots/structured data/OG image/noindex; CSP and security headers; axe WCAG 2.2 AA — zero serious/critical violations on 6 key pages; contact enquiry → contact + submission + task; newsletter pending until confirmed; free masterclass registration end to end; free booking on a phone end to end; paid checkout honestly disabled without Paystack; anonymous redirects; wrong password; protected APIs 401/403 (exports, media, files, receipts, webhook, internal revalidation); customer cannot reach admin; content manager can't open payments; IDOR on another customer's class page → 404; meeting link absent from public HTML; owner opens all 25 admin areas without errors; create & publish an article and view it publicly; create a contact, log a note and move it in the pipeline.

Screenshots of the real implemented screens: `docs/screenshots/` (home desktop & mobile, masterclass registration, article, mobile booking, checkout status, admin dashboard, CRM list & pipeline, masterclasses, bookings, reconciliation, Website Studio, portal on mobile, protected class page).

## 6. Security findings and fixes

Found and fixed during the build: plaintext booking-management token was briefly stored with an order (replaced by minting a fresh token at confirmation); refund retries with the same idempotency key threw instead of no-op (fixed, tested); a malformed `javascript:` email button was left as inert text (now dropped); constructor-name error mapping would break under minification (replaced with a base class); `datetime-local` inputs interpreted in DB time zone (now business time zone); header overflow at 320 px; calendar used an invalid ARIA grid. `pnpm audit --prod`: 2 moderate advisories (minimatch via the shadcn CLI, uuid via exceljs) — shadcn moved to dev dependencies and uuid overridden to 11.x; **now 0 known vulnerabilities**. See SECURITY.md for controls and known gaps (MFA for local auth, no external pen test).

## 7. Performance (actual Lighthouse 12, local production build on a MacBook, `next start`, Lighthouse default simulated throttling)

| Page | Mobile perf | Desktop perf | A11y | Best pr. | Mobile LCP | Desktop LCP | CLS |
|---|---|---|---|---|---|---|---|
| Home | 96 | 100 | 100 | 100 | 2.8 s | 0.6 s | 0 |
| Masterclass landing | 96 | 100 | 100 | 96 | 2.8 s | 0.7 s | 0 |
| Article | 96 | 100 | 100 | 100 | 2.8 s | 0.6 s | 0 |
| Booking | 96 | 100 | 100 | 100 | 2.8 s | 0.6 s | ≤0.005 |

SEO scored 63–66 solely because indexing is intentionally disabled before launch (`is-crawlable`); it is the only failing SEO audit. **Mobile LCP (2.8 s) misses the 2.5 s target** under simulated slow 4G — 87% is render delay while web fonts load; trimming unused font weights and preloads improved it from 3.5 s. TBT ≤ 20 ms (INP proxy). Not measured on Contabo/Cloudflare or real devices.

## 8. Database migration status

9 migrations (`supabase/migrations/2026112500000{1..9}_*.sql`) apply cleanly on PostgreSQL 18 (dev, test and restore databases); migration runner records checksums. Not yet applied to Supabase (no credentials).

## 9. Backup and restoration evidence

`scripts/backup.sh` produced an AES-256 encrypted `pg_dump` (272 KB) with SHA-256 checksum; `scripts/restore.sh` restored it into an isolated `brand_restore_check` database. Row counts matched the source exactly (migrations 9, pages 7, events 2, users 1, audit 4) and the restored database contained the capacity trigger, immutability trigger and no-overlap exclusion constraint. A wrong passphrase aborted the restore. Not yet run against Supabase or Contabo.

## 10. Deployment status

**Not deployed.** Dockerfile (web + worker targets), compose (joins the existing proxy network, resource limits, log rotation, restart policy), Caddy snippet, deploy script (pre-deploy backup → build → migrate → health check), rollback procedure and backup cron are written but **have not been built or run** (Docker unavailable locally; no server access). The Next.js production build succeeds (`output: standalone`); the worker ran against the dev database, processed all queued jobs, delivered 14 queued emails to the dev mailbox, ran all 9 scheduled tasks and shut down gracefully on SIGTERM.

## 11. Estimated operating costs (monthly; verify current prices before committing)

| Item | Estimate |
|---|---|
| Contabo server | Existing — no new cost (needs ~1.2 GB RAM headroom) |
| Supabase | Free $0 now; **Pro from $25** recommended before real payments (verified on supabase.com/pricing 2026-11-26) — or $0 extra if the database moves to Contabo |
| Cloudflare DNS/CDN | Free plan sufficient |
| Cloudflare R2 | Likely $0–2 at this scale (R2 has a free storage allowance and no egress fees; check Cloudflare's current pricing) |
| SMTP | $0 on a free tier for low volume; ~$10–25 if campaigns grow |
| Paystack | No monthly fee; per-transaction fee (check current Ghana rates) |
| mNotify SMS (optional) | Pay-per-SMS |
| AI assistant (optional) | Pay-per-use, capped by `AI_MONTHLY_REQUEST_LIMIT` |

## 12. Required client information

Brand name and professional title, logo, colour preferences, professional photographs (portrait, working shots), biography and career story, positioning statement, services with descriptions/durations/prices/policies, working hours and time zone, upcoming masterclasses and ticket prices, courses/products and files, speaking topics and past engagements (with permission), press links, testimonials **with written consent**, case studies **with client approval**, social profile URLs, business contact details and legal name, refund/cancellation policy decisions, and lawyer-reviewed privacy policy and terms.

## 13. Required external credentials

`DATABASE_URL` (+ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Supabase Auth) · `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` (test first) · `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` · `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL` · Contabo SSH access + shared proxy network name · Cloudflare DNS access · optional: `GOOGLE_CLIENT_ID/SECRET`, `MNOTIFY_API_KEY`/`MNOTIFY_SENDER_ID`, `ANTHROPIC_API_KEY`. Generate `APP_SECRET` and `BACKUP_PASSPHRASE` on the server.

## 14. Known limitations

Listed in §2 plus: mobile LCP above target on simulated slow 4G; Supabase Free has no backups and pauses after a week of inactivity (worker activity keeps it awake; independent backups mitigate data loss); a forwarded meeting link can be used by others (use provider-side registration for premium sessions); 8 lint warnings for intentional reset-on-navigation effects; the demo content must be removed before launch (`pnpm db:demo:remove`).

## 15. Remaining production approval requirements

1. Owner approval to create/upgrade paid services (Supabase Pro or self-hosted DB decision).
2. Staging deployment on Contabo with test credentials, then full manual test of paid flows with Paystack test cards/MoMo, refunds and webhooks.
3. Real backup cron running and one restore drill on the production database.
4. Legal review of policies; real brand content; demo content removed.
5. Explicit approval to switch DNS and to enable live Paystack keys (`PAYMENTS_LIVE_APPROVED=true`), followed by one small real transaction and refund.

## 16. Recommendation

**NO-GO for production with live payments today** — external integrations (Paystack, SMTP, R2, Supabase Auth) are unverified, nothing has been deployed, and Supabase Free provides no backups.

**GO for staging deployment** as soon as the credentials in §13 are provided. The core business logic, security controls and data integrity are implemented and tested; the remaining work is configuration, verification against the real services, and client content.
