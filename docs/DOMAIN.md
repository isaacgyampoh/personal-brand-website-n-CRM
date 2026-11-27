# Connecting the permanent domain (Cloudflare)

No rebuild and no database migration are needed. Every domain-dependent URL — email links, password resets, Paystack callback/webhook, Hubtel callback, Google OAuth redirect, canonical URLs, Open Graph, sitemap and robots — is derived from **one setting, `APP_URL`**, at runtime.

## Steps (about 15 minutes, needs your approval for DNS)

1. **Buy the domain in Cloudflare** (Domain Registration). It is then already on Cloudflare DNS.
2. **DNS** (Cloudflare → DNS → Records), pointing at the Contabo server's IP, proxied (orange cloud):
   - `A  @    <server IP>`
   - `CNAME  www  @`
3. **SSL/TLS** → mode **Full (strict)**. **Scrape Shield → Email Address Obfuscation: Off** (it rewrites pages; the proxy also sends `no-transform` as a safeguard).
4. **Server proxy**: add the site block from `deployment/Caddyfile.snippet` with the new domain; add a `www` block that redirects permanently:
   ```
   www.example.com {
   	redir https://example.com{uri} permanent
   }
   ```
   Caddy obtains HTTPS certificates automatically. Remove the staging `X-Robots-Tag` block for the production site.
5. **App setting**: set `APP_URL=https://example.com` in `deployment/.env.production`, then restart: `docker compose -f deployment/docker-compose.yml up -d web worker`.
6. **Providers** (Studio → Integrations shows the new URLs with copy buttons):
   - Paystack → Settings → API Keys & Webhooks: update the Webhook URL and Callback URL.
   - Google Cloud → OAuth client: add the new Authorised redirect URI, then press *Connect Google account* again.
   - Hubtel: nothing to change (callback URLs are sent with each payment).
   - Email: add SPF/DKIM/DMARC records for the sending domain as given by your email provider.
7. **Search engines**: Studio → Website → SEO → enable indexing. The sitemap is at `/sitemap.xml`.

## What happens to existing data and users

All content, customers, bookings, orders, credentials and settings stay in the same database. Sign-in cookies are tied to a hostname, so everyone (including Studio staff) signs in once on the new domain. Emailed links sent before the switch still point to the old hostname; keep the old staging hostname redirecting for a few days if it was shared.
