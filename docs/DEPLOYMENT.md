# Deployment (Contabo, Docker, Caddy, Cloudflare)

> Nothing has been deployed yet. No server credentials were provided, Docker is not installed on the development machine, and **the images below have not been built or run** — the Next.js production build itself was verified locally. Inspect the server before changing anything.

## 0. Inspect the server first (read-only)

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'   # existing apps — do not touch
docker network ls                                           # find the shared reverse-proxy network name
nproc; free -h; df -h                                       # capacity: web needs ~768 MB, worker ~384 MB
ls /etc/caddy /opt/*/Caddyfile 2>/dev/null                  # where the shared Caddy config lives
```

Do not reinstall the server, replace the shared proxy, or modify other projects' containers, databases or domains.

## 1. Staging first

Create a staging subdomain (e.g. `staging.example.com`) on Cloudflare (proxied, SSL mode **Full (strict)**). Use a separate env file and database, Paystack **test** keys, and `seo.indexable=false`.

## 2. Configure

```bash
git clone <repo> /opt/brand-platform && cd /opt/brand-platform/deployment
cp ../.env.example .env.production && chmod 600 .env.production   # fill in all values
# add BACKUP_PASSPHRASE (also store it in the owner's password manager)
```

Set `PROXY_NETWORK` in the env if the shared network isn't called `proxy`. Add `Caddyfile.snippet` to the **existing** Caddyfile (replace `{$SITE_DOMAIN}` and the upstream container name), then `caddy validate` and reload Caddy.

## 3. Deploy

```bash
RELEASE=$(git rev-parse --short HEAD) ENV_FILE=.env.production ./deploy.sh
```

The script takes a backup, builds `web` and `worker` images tagged with the commit, starts the worker (which applies pending migrations), starts the web container and waits for `/api/health`. Containers use `restart: unless-stopped`, so they come back after a reboot (ensure the Docker service is enabled: `systemctl enable docker`).

## 4. Rollback

```bash
RELEASE=$(cat .last-good-release) docker compose up -d     # previous images are still tagged
```

Migrations are forward-only and additive; if a release added a migration that must be undone, restore the pre-deploy backup the script created (see Restore). Never run a down-migration by hand on production.

## 5. Backups & restore

- Nightly: install `deployment/backup.cron` (encrypted `pg_dump`, keeps 14, synced to an R2 bucket). Supabase Free has **no automatic backups**.
- Restore drill (do this monthly, and before go-live):

```bash
createdb restore_check
TARGET_DATABASE_URL=postgres://…/restore_check CONFIRM_RESTORE=yes BACKUP_PASSPHRASE=… ../scripts/restore.sh /var/backups/brand-platform/<file>.dump.enc
```

## 6. Monitoring

- `GET /api/health` (used by Docker and Caddy) — add it to the existing uptime monitor.
- Admin → Jobs & logs: worker heartbeat, dead jobs, failed emails, database size, audit log.
- Admin → Payments → Reconciliation: should show no high-severity issues.
- `docker compose logs -f worker web` (log rotation configured: 5 × 10 MB per container).

## 7. Go live (requires the owner's explicit approval)

1. Pass the go-live checklist in `docs/DELIVERY-REPORT.md`.
2. Switch DNS for the main domain in Cloudflare (approval required).
3. Swap to live Paystack keys and set `PAYMENTS_LIVE_APPROVED=true` (approval required); make one small real transaction and refund it.
4. Enable indexing in Website → Brand & design → SEO.
