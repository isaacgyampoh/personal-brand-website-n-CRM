# Deployment — Contabo (Docker + the existing reverse proxy)

> **Status (2026-11-27): live at https://adwoagyanwah.com** — Contabo `169.58.120.116`, Compose project `esther`, behind the shared `central-caddy`. Cloudflare proxied (DNS `@` A + `www` CNAME), SSL **Full (strict)** with a Let's Encrypt origin certificate (HTTP-01; TLS-ALPN cannot pass the proxy, Caddy falls back automatically), Always Use HTTPS, `www` → apex 308, the old `esther.169-58-120-116.sslip.io` → apex 308 (flag file `caddy-sites/esther-redirect.flag`, no restart needed). Cloudflare free-plan rules: cache bypass for Studio/portal/auth/checkout/APIs/webhooks, edge cache for `/_next/static` and `/media`, WAF block of scanner paths, sign-in challenge on high threat score, 1 rate-limit rule on auth POSTs. Bot Fight Mode deliberately off (cannot exempt payment webhooks on the free plan). `CF-Connecting-IP` is only trusted from Cloudflare ranges. Payments not live (`PAYMENTS_LIVE_APPROVED=false`); search indexing off until launch approval. Nightly encrypted backups 02:30 UTC and a 5-minute monitor in the `esther-deploy` crontab. The shared proxy has `admin off` — config changes need `/srv/central/compose/central.sh restart caddy`, only with approval and in a quiet window for the other apps.

## 0. Inspect the server first (read-only)

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'   # existing apps — never touch
docker network ls                                                      # name of the shared reverse-proxy network
docker inspect <proxy-container> --format '{{json .Mounts}}'           # where the proxy config lives (Caddy/Traefik/Nginx)
nproc; free -h; df -h /var/lib/docker                                  # capacity: postgres ≤1 GB, web ≤768 MB, worker ≤384 MB
ss -ltnp | grep -E ':5432|:3000' || true                                # make sure no port conflicts / no public Postgres
```

Do not reinstall the server, stop or restart unrelated containers, replace the shared proxy, or modify other projects' databases, volumes, domains or credentials.

## 1. Isolation model

- Own Compose project (`brand-platform`), own images, own volumes (`pgdata`, `media`), own internal network.
- **PostgreSQL runs in this stack, on the internal network only — no published port.** The app connects as the least-privilege role `brand_app` (created on first boot by `deployment/postgres/init-app-role.sh`; no superuser, no createdb/createrole). The admin role is used only for restore tests.
- Only the `web` container joins the existing proxy network. Resource limits and log rotation are set for every container; all restart `unless-stopped`.
- (Alternative: an existing shared PostgreSQL server may be used with a **new database and new role** for this project only — never an existing database. Set `DATABASE_URL` accordingly and remove the `postgres` service.)

## 2. Secrets (all chmod 600, never committed)

```bash
git clone <repo> /opt/brand-platform && cd /opt/brand-platform/deployment
mkdir -p secrets && chmod 700 secrets
openssl rand -base64 36 | tr -d '\n' > secrets/postgres_admin_password
openssl rand -base64 36 | tr -d '\n' > secrets/app_db_password
chmod 600 secrets/* && sudo chown 70:70 secrets/*   # readable only by the postgres container user
cp .env.production.example .env.production   # APP_URL, APP_SECRET, DATABASE_URL (brand_app + app_db_password),
                                             # CREDENTIALS_MASTER_KEYS, STAFF_MFA_REQUIRED=true, PAYMENTS_LIVE_APPROVED=false
cp .env.backup.example .env.backup           # BACKUP_PASSPHRASE, ADMIN_DATABASE_URL, BACKUP_R2_* (backup-only bucket + token)
chmod 600 .env.production .env.backup
```

Copy `APP_SECRET`, `CREDENTIALS_MASTER_KEYS` and `BACKUP_PASSPHRASE` into the client's password manager **and** an offline record. Business integrations (Paystack, SMTP, R2…) are **not** put in env files — the client enters them in Studio → Integrations.

For staging before R2 is connected, add `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true` (files go to the `media` volume and are included in host backups only if that volume is backed up — connect R2 before launch).

## 3. Reverse proxy & HTTPS

Add `Caddyfile.snippet` to the **existing** proxy configuration (replace `{$SITE_DOMAIN}` with the staging host and the upstream with the web container name, e.g. `brand-platform-web-1:3000`), validate, then reload the proxy (reload, not restart). Create the staging DNS record (e.g. `staging.<domain>`) — **production DNS changes need the client's approval**.

## 4. Deploy

```bash
RELEASE=$(git rev-parse --short HEAD) deployment/deploy.sh
```

Preflight (env files, secret permissions, master key, proxy network) → build → start private PostgreSQL → pre-deploy encrypted backup (if data exists) → worker (applies pending migrations) → web → health check (`/api/health`). Then provision the first administrator ([ADMIN-ONBOARDING.md](ADMIN-ONBOARDING.md)) and install the nightly backup job ([BACKUPS.md](BACKUPS.md)).

## 5. Rollback

```bash
RELEASE=$(cat deployment/.last-good-release) docker compose -f deployment/docker-compose.yml up -d web worker
```

Migrations are forward-only and additive. If a release's migration must be undone, restore the pre-deploy backup into a new database and switch `DATABASE_URL` to it ([BACKUPS.md](BACKUPS.md)); never hand-edit production.

## 6. Monitoring

- `GET /api/health` — add to the existing uptime monitor.
- Studio → Activity (problems tab), Jobs & logs (worker heartbeat, dead jobs, failed emails, DB size), Finance/Reconciliation.
- Backup job: success/failure ping (`HEALTHCHECK_URL`) and a high-priority Studio task on failure.
- `docker compose -f deployment/docker-compose.yml logs -f web worker` (rotated, 5 × 10 MB).

## 7. Go-live (each step needs the client's explicit approval)

1. Pass the checklist in [DELIVERY-REPORT.md](DELIVERY-REPORT.md); remove demo content (Studio → Get started shows it).
2. Paystack: live keys verified in the Integration Centre (still test mode until step 3).
3. Operator sets `PAYMENTS_LIVE_APPROVED=true`, restarts, client switches Paystack to Live; one small real payment and refund.
4. Point the production domain at the server (DNS) and enable search indexing in Website → SEO.
