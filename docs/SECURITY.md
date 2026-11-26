# Security

## Controls in place

- **Authorisation on the server for every request.** Each admin page (`requireStaffPage`), server action (`assertPermission`) and API route checks the role's permissions from the database. Hidden UI is never relied on. Roles: owner, admin, content manager, booking manager, finance manager, customer; permissions editable by the owner.
- **Customer data isolation.** Portal queries are always scoped to contacts linked to the signed-in user's **verified** email; purchases are never attached to an account whose email isn't verified (tested). Protected class pages, lessons, downloads, receipts and certificates check ownership/entitlements server-side; other users get 404.
- **Database** — parameterised queries only; RLS enabled on every table with no grants to `anon`/`authenticated`; critical invariants as constraints/triggers; immutable ledger, audit log, receipts and webhook payloads.
- **Payments** — server-side initialisation and pricing; HMAC-SHA512 webhook verification (timing-safe); independent `verify` call before any fulfilment; amount/currency/reference checks; idempotent webhook storage and single fulfilment; live keys refused without explicit approval flag.
- **Authentication (built-in provider)** — scrypt (N=2^15) password hashes; random session tokens stored only as HMAC hashes; httpOnly + SameSite=Lax + Secure cookies; account lockout after 8 failures; per-IP and per-email rate limits on login, reset, magic link, registration; generic error messages (no account enumeration); single-use expiring reset/verify/magic-link tokens; sessions revoked on password reset and suspension.
- **Input & output** — Zod validation on every action/route; React escaping; rich text stored as JSON and rendered by a whitelist renderer (no raw HTML); website builder only accepts known block types and safe URL schemes; email templates escape variables and drop unsafe links; CSV exports neutralise spreadsheet formulas.
- **Uploads** — type detected from magic bytes (SVG rejected), size limits, images re-encoded (strips EXIF/GPS and polyglots), duplicate detection, private files only via short-lived signed URLs, deletion blocked while referenced.
- **Headers** — per-request CSP with nonces (`strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, no `X-Powered-By`; admin/portal/studio marked noindex.
- **CSRF** — Server Actions use Next.js origin checks; cookie-authenticated POST route handlers check `Origin`; SameSite cookies.
- **Abuse** — PostgreSQL-backed rate limits on public forms, booking, checkout, uploads, AI; honeypot fields.
- **Privacy** — analytics stores no IP addresses (daily-rotating salted hash), honours Do Not Track / Global Privacy Control; marketing consent recorded with source and time; double opt-in; one-click unsubscribe (RFC 8058); suppression list; contact erasure keeps only legally required financial records.
- **Secrets** — environment variables only; OAuth refresh tokens encrypted with AES-256-GCM; the service-role key is never used.

## Checks performed (see delivery report for results)

Integration tests: concurrent double booking, overselling, webhook signature rejection, duplicate/out-of-order webhooks, tampered amounts and currencies, ledger/audit immutability, order transition enforcement, entitlement isolation, quiz answers never sent to the client. E2E: anonymous access to admin/portal/APIs, wrong-password handling, customer → admin escalation, role-limited staff, IDOR on class pages, meeting links absent from public HTML, security headers. `pnpm audit` run.

## Known gaps

- TOTP MFA for the built-in auth provider is not implemented (use Supabase Auth MFA, or add it before relying on `local` auth for staff).
- No automated DAST/penetration test was run; recommended before go-live.
- The meeting link shown to an attendee can be forwarded — use the provider's registration/waiting-room features for high-value sessions.
