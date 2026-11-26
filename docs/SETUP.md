# Setup & configuration

All secrets are environment variables on the server. Nothing secret is stored in the repository, the browser bundle or (except encrypted OAuth tokens) the database. `.env.example` lists every variable.

## 1. Core

| Variable | Notes |
|---|---|
| `APP_URL` | Public URL, e.g. `https://example.com` (used in emails, webhooks, OAuth) |
| `APP_SECRET` | ≥32 random characters (`openssl rand -base64 48`). Signs tokens, hashes session/reset tokens, encrypts OAuth credentials. **Changing it logs everyone out and invalidates links.** |
| `DATABASE_URL` | Supabase: Settings → Database → *Session pooler* or direct connection string. Set `DATABASE_SSL=true`. |
| `INTERNAL_APP_URL` | For the worker in Docker: `http://web:3000` (cache invalidation after scheduled publishing) |

Apply the schema: `DATABASE_URL=… npx tsx scripts/migrate.ts --seed` (the worker container also runs pending migrations on start). Use this runner rather than `supabase db push` so there is one migration history.

## 2. Authentication

`AUTH_PROVIDER=supabase` (recommended on Supabase) or `local` (built-in scrypt + database sessions; fully tested; also the path for self-hosting).

For Supabase Auth:
1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Settings → API Keys). The secret key is not required by the app.
2. Authentication → URL Configuration: Site URL = `APP_URL`; add `APP_URL/auth/confirm` to redirect URLs.
3. Authentication → Email Templates — point links at the app so it can verify server-side:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - Magic link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
4. Authentication → SMTP: use the same SMTP provider (Supabase's built-in mailer is heavily rate-limited).
5. Optional: enable MFA for staff in Supabase. (Built-in `local` auth does not implement TOTP MFA yet — see the delivery report.)

**Status: the Supabase adapter is implemented but not verified against a live project** (no credentials were available).

## 3. First owner account

- `local` auth: `OWNER_PASSWORD='…' pnpm create-owner --email owner@… --name "…"`
- `supabase` auth: sign up on `/register`, verify the email, then `pnpm create-owner --email owner@…` promotes the account.

Invite other staff from **Admin → Settings → Team & roles**.

## 4. Payments (Paystack)

1. Create/verify a Paystack business account (Ghana). Enable Mobile Money and cards.
2. Use **test keys** first: `PAYSTACK_SECRET_KEY=sk_test_…`, `PAYSTACK_PUBLIC_KEY=pk_test_…`.
3. Paystack dashboard → Settings → API Keys & Webhooks: Webhook URL `APP_URL/api/webhooks/paystack`, Callback URL `APP_URL/checkout/complete`.
4. Run end-to-end tests with Paystack test cards / test MoMo numbers: paid booking, paid ticket, course, product, failed payment, refund.
5. Live: the app refuses an `sk_live_` key unless `PAYMENTS_LIVE_APPROVED=true` — set it only after the go-live review in the delivery report.

Orders are only marked paid after the server verifies the transaction with Paystack (callback page, webhook and a 5-minute reconciliation job all verify independently).

## 5. Email (SMTP)

`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — any provider (e.g. Brevo, Postmark, Amazon SES, Zoho). Set SPF, DKIM and DMARC for the sending domain. Edit wording in **Admin → Settings → Email templates**. "Accepted" in the logs means the mail server accepted the message, not that it reached the inbox.

## 6. Storage (Cloudflare R2)

Create two buckets: a **public** one (website images, connect a custom domain such as `media.example.com` → `R2_PUBLIC_BASE_URL`) and a **private** one (paid downloads, recordings — never public). Create an R2 API token with read/write on both. Set `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`. Production refuses to start with local storage. **Status: implemented, not verified against R2.**

## 7. Optional integrations

- **SMS (mNotify):** `MNOTIFY_API_KEY`, `MNOTIFY_SENDER_ID` (sender ID must be approved by mNotify). Unverified.
- **Google Calendar:** create an OAuth client (Web) in Google Cloud, redirect URI `APP_URL/api/integrations/google/callback`, set `GOOGLE_CLIENT_ID/SECRET`, then **Admin → Settings → Integrations → Connect**. Confirmed bookings are mirrored to the calendar. Unverified.
- **Zoom / Google Meet:** paste meeting links per event or service (joining details are only shown to confirmed attendees). Automatic Zoom meeting creation is not implemented.
- **AI assistant:** `AI_ENABLED=true`, `ANTHROPIC_API_KEY`, optional `AI_MODEL` (default `claude-opus-5-5`) and `AI_MONTHLY_REQUEST_LIMIT` (default 300). Drafts only; never auto-publishes. Unverified (no key).

## 8. Before launch checklist

1. Replace demo content: `pnpm db:demo:remove` (archives demo rows that have real transactions), then fill **Website → Brand & design**, contact details, social links.
2. Write real content in the Website Studio (home, about, speaking) and publish.
3. Have the **legal pages** written/reviewed by a qualified person (the app flags them as "requires legal review").
4. Add real services, masterclasses, courses and products. Add testimonials **only with recorded consent**.
5. Configure SMTP, R2, Paystack (test → live after review), backups (see DEPLOYMENT.md).
6. **Website → Brand & design → SEO**: tick "Allow search engines to index the site" at launch.
