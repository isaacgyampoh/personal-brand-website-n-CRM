# Integration Centre

Studio → **Integrations** (`/admin/settings/integrations`). The client connects and manages every business integration here without a developer or redeploy. Infrastructure secrets (database, SSH, `APP_SECRET`, master keys) are **not** editable here — they stay in the server environment.

## Providers

| Integration | Purpose | Required for launch | Verification status in this delivery |
|---|---|---|---|
| Paystack | Primary payments (MoMo, cards), test & live keys kept separately | Yes (for paid sales) | Adapter + webhook/verify/refund logic tested with a test double and HMAC vectors. **Not yet verified against Paystack** — no test keys supplied. |
| Hubtel | Optional secondary checkout (Ghana) | No | Implemented from Hubtel's published Online Checkout + Transaction Status API descriptions (docs site was unreachable from the build environment). Offline tests only. **Unverified**; locked behind operator approval because Hubtel has no test mode. |
| Email (SMTP) | All transactional & campaign email | Yes | Config, SSRF guard, connection test and test email implemented; tested against a refused private host. **Not verified with a real SMTP account.** |
| Cloudflare R2 | Media, course files, downloads | Yes (production) | Write/read/delete connection test implemented. **Not verified** — no R2 credentials supplied. Local disk storage works for staging only with `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`. |
| Google Calendar & Meet | Busy-time sync, events for bookings, invitations, Meet links | No | OAuth web flow, calendar selection, busy sync, create/update/cancel, Meet creation implemented against Google APIs. **Unverified** — no OAuth client supplied. |
| Zoom | Automatic meetings for bookings and masterclasses | No | Server-to-Server OAuth, create/update/delete implemented. **Unverified** — no Zoom app supplied. |
| mNotify | Optional SMS reminders | No | Send + balance test implemented. **Unverified.** |
| AI (Claude) | Optional drafting assistant, monthly cap | No | Model check test + drafting implemented. **Unverified** — no key supplied. |

The application works with every optional integration switched off: free bookings and registrations, manual meeting links, manual/offline payments, local email capture in development.

## Status rules (`lib/integrations/definitions.ts → computeStatus`)

| Status | Meaning |
|---|---|
| Not configured | Nothing saved yet |
| Configuration incomplete | A required field is missing |
| Disabled | Complete, switched off |
| Verification required | Saved/changed since the last successful test |
| Connected | **The exact current configuration passed a real connection test** (a hash of the active settings is stored with the test result; any change invalidates it) |
| Connection failed | The latest test failed (message shown, never containing secrets) |

Checkout only uses a payment provider that is enabled **and** Connected; live mode additionally requires the operator flag `PAYMENTS_LIVE_APPROVED=true`.

## Credential security

- **Encryption**: AES-256-GCM, fresh 96-bit nonce per encryption, provider name bound as additional authenticated data (ciphertexts can't be swapped between providers). Format `v<keyVersion>.<nonce>.<tag>.<ciphertext>`.
- **Master keys**: `CREDENTIALS_MASTER_KEYS="2:<base64>,1:<base64>"` in the server environment only — never in PostgreSQL, Git or backups. First entry encrypts; older entries decrypt until rotation.
- **Write-only secrets**: the browser only ever receives a mask such as `sk_test_••••9876`. A blank secret field keeps the stored value; "Remove saved value" clears it.
- **Permissions**: `settings:manage` plus **recent authentication** (password, and MFA code when enabled, within 15 minutes) for every change, test, enable/disable and Google connect.
- **Audit**: field *names* changed, test outcomes and enable/disable events — never values. Test error messages are scrubbed of any configured secret.
- **SSRF**: configurable hosts/URLs (SMTP host, Hubtel endpoints) must resolve to public addresses; loopback, private, link-local (incl. cloud metadata), CGNAT and reserved ranges are refused. `ALLOWED_PRIVATE_HOSTS` can allow a specific internal relay.

### Rotating the master key

1. `openssl rand -base64 32` → new key.
2. Prepend with a higher version: `CREDENTIALS_MASTER_KEYS="3:NEW,2:OLD"`; restart web + worker.
3. `docker compose --profile tools run --rm tools npx tsx --tsconfig tsconfig.worker.json scripts/rotate-credentials.ts` (locally: `pnpm credentials:rotate`) — reports how many remain on old keys.
4. When 0 remain, remove the old key, restart, and update the offline copy.

### If the master key is lost

Stored integration credentials cannot be decrypted (by design). Everything else in the database is unaffected. Re-enter the provider credentials in the Integration Centre. Keep the key in the client's password manager **and** offline — see [BACKUPS.md](BACKUPS.md).

## Payments specifics

- Paystack test/live keys are stored separately; the key prefix must match its mode. Webhook signature = HMAC-SHA512 of the raw body with the active secret key. A payment is marked paid **only** after `GET /transaction/verify/:reference` confirms reference, amount, currency and our merchant account (implicit in the secret key). Redirects never mark anything paid.
- Every payment row records the provider and mode that created it, and is always verified/refunded through that provider — never re-routed. Checkout refuses to start a new attempt with a different provider while one is still pending.
- Hubtel callbacks are unsigned, so each callback URL carries our own expiring HMAC token bound to the payment reference, and the outcome is always confirmed with Hubtel's status API (which requires the server's IP to be whitelisted by Hubtel). Hubtel refunds are done in the Hubtel dashboard and then confirmed in Studio (access is revoked only after confirmation).

## Meetings & calendar

- Services and masterclasses choose *Paste a link*, *Zoom* or *Google Meet*. Automatic meetings are created when a booking is confirmed (or a masterclass's joining method is saved), updated on reschedule and removed on cancellation by the worker. A link typed by staff is never overwritten. If the chosen provider isn't connected, the owner gets a task to add a link manually.
- Meeting links are only shown to confirmed participants (booking manage page/portal; masterclass links only inside the access window). Masterclass attendees are not added as calendar guests.
- Google busy times (excluding our own tagged events) feed slot availability; the database exclusion constraint remains the authority against double booking.
