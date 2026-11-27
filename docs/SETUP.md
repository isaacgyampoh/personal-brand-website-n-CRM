# Setup & configuration

Two kinds of configuration:

1. **Infrastructure** (server operator, env file, never in Studio): `APP_URL`, `APP_SECRET`, `DATABASE_URL`, `CREDENTIALS_MASTER_KEYS`, `PAYMENTS_LIVE_APPROVED`, `STAFF_MFA_REQUIRED`, storage fallback flags. See `.env.example`.
2. **Business integrations** (client, Studio → Integrations): Paystack, Hubtel, SMTP, Cloudflare R2, Google Calendar & Meet, Zoom, mNotify, AI. Encrypted in PostgreSQL. See [INTEGRATIONS.md](INTEGRATIONS.md).

## Local development

```bash
pnpm install
cp .env.example .env.local
#   NODE_ENV=development  APP_URL=http://localhost:3000
#   APP_SECRET=$(openssl rand -base64 48)
#   DATABASE_URL=postgres://localhost/brand_dev
#   CREDENTIALS_MASTER_KEYS=1:$(openssl rand -base64 32)
createdb brand_dev
pnpm db:seed                                        # migrations + reference data
pnpm create-owner --email you@example.com --name "You"   # open the printed link to set a password
pnpm db:demo                                        # optional demo content (flagged; removable with pnpm db:demo:remove)
pnpm dev & pnpm worker
```

## Configuring integrations (Studio → Integrations)

Each card shows setup steps, the URLs to paste into the provider (webhooks, callbacks, OAuth redirect) with copy buttons, and **Test connection**. A card says **Connected** only after a real test of the current settings passes.

| Integration | Where to get credentials | Notes |
|---|---|---|
| Paystack | dashboard.paystack.com → Settings → API Keys & Webhooks | Enter **test** keys first; paste the Webhook URL and Callback URL shown on the card. Live mode needs the operator flag. |
| Hubtel | Hubtel merchant dashboard → API access (Online Checkout) | API ID, API key, POS Sales ID. Ask Hubtel to whitelist the server's public IP for the status API. Locked until live payments are approved (no test mode). |
| SMTP | Your email provider (e.g. Zoho, Google Workspace, Brevo, Postmark SMTP) | Port 587 + STARTTLS or 465 + TLS. Use **Send test email**. Set up SPF/DKIM/DMARC for the sending domain. |
| Cloudflare R2 | Cloudflare → R2 → Manage API tokens (Object Read & Write on the two buckets) | Public bucket with a custom domain/r2.dev URL for media; private bucket for paid files. The test writes, reads and deletes a small file in both. |
| Google Calendar & Meet | Google Cloud console → APIs & Services: enable Google Calendar API, OAuth consent screen, Web OAuth client | Add the redirect URI shown on the card, save client ID/secret, click **Connect Google account**, choose the calendar. |
| Zoom | marketplace.zoom.us → Develop → Server-to-Server OAuth app | Scopes: `meeting:write:admin`, `meeting:read:admin`, `user:read:admin`. Account ID, client ID, client secret. |
| mNotify | mNotify dashboard → API key, approved sender ID | Optional SMS reminders. Test reads your SMS balance. |
| AI | console.anthropic.com → API keys | Optional; monthly request cap; never invents testimonials or results. |

Then **Business settings → Checkout** chooses the provider for new checkouts (Paystack by default).

## Going live

See the checklist in [DELIVERY-REPORT.md](DELIVERY-REPORT.md) and [DEPLOYMENT.md](DEPLOYMENT.md) §7.
