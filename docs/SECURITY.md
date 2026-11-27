# Security

## Controls

- **Server-side authorisation everywhere.** Pages (`requireStaffPage`), server actions (`assertPermission`) and API routes check role permissions loaded from the database on every request. Staff who must enrol in MFA hold **no** permissions until they do (enforced centrally in `getCurrentUser`).
- **Authentication** — built-in, PostgreSQL-backed: scrypt (N=2^15) hashes; common/all-digit/email-derived passwords refused; random session tokens stored only as HMAC hashes; httpOnly + SameSite=Lax + Secure cookies; lockout after 8 failures; per-IP/per-account rate limits on login, MFA, reset, magic link, registration and re-authentication; no account enumeration; single-use expiring tokens; all sessions revoked on password reset, suspension and MFA enrolment.
- **Staff MFA** — RFC 6238 TOTP (±1 step, **replay-protected** by storing the last accepted step), 10 single-use recovery codes stored as keyed hashes, MFA secret encrypted at rest. A password-only session is a *pending* session that grants nothing. Recovery reset only from the server shell, audited.
- **Recent authentication** (15 minutes) for integration credentials, team/roles/permissions, refunds and offline payments.
- **First admin** provisioned only from the server shell with a single-use set-password link — no default credentials, no public admin sign-up.
- **Integration credentials** — AES-256-GCM vault with versioned master keys outside the database, unique nonces, AAD per provider, write-only masked display, rotation script, audit without values, error messages scrubbed. See [INTEGRATIONS.md](INTEGRATIONS.md).
- **SSRF** — client-configurable endpoints (SMTP host, Hubtel URLs) must be https (where applicable) and resolve to public addresses; private, loopback, link-local/metadata, CGNAT and reserved ranges refused. Brand logos for PDFs are read only from our own media library (never fetched from URLs).
- **Customer data isolation** — portal data is scoped to contacts linked to the user's **verified** email; class pages, lessons, downloads, receipts and certificates check ownership/entitlements; others get 404. Meeting links are only shown to confirmed participants within the access window.
- **Payments** — server-side pricing; HMAC-SHA512 webhook verification (timing-safe); independent provider verification of reference, amount and currency before fulfilment; verification always through the provider that created the payment; idempotent event storage; single fulfilment; Hubtel callbacks require our signed, reference-bound token and are re-checked with Hubtel's status API; live mode and Hubtel locked behind the operator's approval flag.
- **Database** — parameterised SQL; RLS enabled and all privileges revoked from `PUBLIC`; app connects as a least-privilege role; invariants as constraints/triggers; immutable ledger, audit log, receipts and webhook payloads; PostgreSQL on a private network with no published port.
- **Input & output** — Zod validation; React escaping; rich text as JSON rendered by a whitelist renderer; builder accepts only known blocks and safe URL schemes; email variables escaped; CSV cells formula-neutralised; XLSX written as plain values.
- **Uploads** — magic-byte detection (SVG refused), size limits, images re-encoded (EXIF/GPS stripped — tested), private files via short-lived signed URLs, deletion blocked while referenced.
- **Headers** — per-request nonce CSP (`strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy; Studio/portal noindex.
- **CSRF** — Server Actions origin checks; SameSite=Lax cookies; cookie-authenticated POST handlers check `Origin`.
- **Privacy** — cookieless analytics without IPs, DNT/GPC honoured, consent recorded, double opt-in, one-click unsubscribe, suppression list, testimonial requests only to real clients and never to suppressed addresses.
- **Backups** — encrypted, verified by restore tests, never restored over the live database ([BACKUPS.md](BACKUPS.md)).

## Security checks performed

| Area | How it was checked | Result |
|---|---|---|
| Authentication bypass | E2E: anonymous → admin/portal/APIs; pending-MFA session → `/admin` | Blocked (redirect/403) |
| MFA | Unit: RFC 6238 vectors, drift, replay; integration: replay & single-use recovery codes; E2E: enrol, wrong code, recovery sign-in | Pass |
| Privilege escalation | E2E: customer → admin; content manager → payments; integration: search/activity scoped by permission | Blocked |
| IDOR | E2E: customer opening another customer's class page | 404, no link leaked |
| Payment manipulation | Integration: tampered amount, wrong currency, wrong provider, pending ≠ paid, redirect never marks paid | Rejected / needs-attention |
| Webhooks | Integration: invalid signature, duplicates, out-of-order refunds; Hubtel: missing/forged/other-reference token, duplicate callback | Rejected / stored once |
| Double bookings & overselling | Integration: concurrent bookings, capacity triggers | Prevented by the database |
| Course/meeting/media access | Integration + E2E: entitlements, meeting links absent from public HTML, private files signed | Pass |
| Credential leakage | Integration + E2E: DB ciphertext and page HTML never contain the secret; audit has field names only | Pass |
| Uploads | Integration: EXIF stripped, re-encoded, crops are new assets | Pass |
| XSS / injection | Whitelist rich-text renderer, CSP nonce, formula-safe CSV (tested), parameterised SQL, LIKE wildcards escaped in search (tested) | Pass |
| CSRF | Framework origin checks + SameSite; reviewed | Pass (review) |
| Rate limiting | Login/MFA limits exercised in E2E (tests must clear them) | Active |
| Unsafe configurable endpoints | Integration + E2E: `127.0.0.1` SMTP/Hubtel refused, `http://` refused | Refused |
| Dependency vulnerabilities | `pnpm audit --prod` | **0 known**; 1 moderate in a dev-only CLI (shadcn → minimatch), not shipped |

## Known gaps / recommendations

- No external penetration test or DAST scan was run — recommended before taking live payments.
- Provider integrations are unverified against live services until credentials are supplied (see INTEGRATIONS.md).
- A joining link can be forwarded by an attendee; use Zoom registration/waiting room for high-value sessions.
- MFA enrolment shows a setup key/link but no QR code.
