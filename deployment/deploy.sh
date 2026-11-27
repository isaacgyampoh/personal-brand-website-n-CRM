#!/usr/bin/env bash
# Repeatable deploy on the Contabo host (run from the repo checkout on the server).
#   RELEASE=$(git rev-parse --short HEAD) deployment/deploy.sh
# Steps: preflight → build images → start private PostgreSQL → pre-deploy backup →
# worker (applies migrations) → web → health check. Previous images stay tagged for rollback.
# Touches only this stack's containers, volumes and network; the shared proxy network is joined, not changed.
set -euo pipefail
cd "$(dirname "$0")"
RELEASE="${RELEASE:-$(git rev-parse --short HEAD)}"
ENV_FILE="${ENV_FILE:-.env.production}"
export RELEASE ENV_FILE

echo "== preflight"
# The postgres container reads its password files as its own user (uid 70 in postgres:alpine).
for f in secrets/postgres_admin_password secrets/app_db_password; do
  [ "$(stat -L -c %u "$f" 2>/dev/null || echo 70)" = "70" ] || echo "WARNING: $f should be owned by uid 70 (sudo chown 70:70 $f) or PostgreSQL cannot read it"
done
for f in "$ENV_FILE" .env.backup secrets/postgres_admin_password secrets/app_db_password; do
  [ -f "$f" ] || { echo "Missing deployment/$f — see docs/DEPLOYMENT.md (templates: .env.production.example, .env.backup.example)"; exit 1; }
done
for f in "$ENV_FILE" .env.backup secrets/postgres_admin_password secrets/app_db_password; do
  [ "$(stat -L -c %a "$f" 2>/dev/null || stat -L -f %Lp "$f")" -le 600 ] || { echo "deployment/$f must be chmod 600"; exit 1; }
done
grep -q '^CREDENTIALS_MASTER_KEYS=[0-9]\+:.\+' "$ENV_FILE" || { echo "CREDENTIALS_MASTER_KEYS is not set in $ENV_FILE"; exit 1; }
docker network inspect "${PROXY_NETWORK:-proxy}" >/dev/null || { echo "Shared proxy network '${PROXY_NETWORK:-proxy}' not found — set PROXY_NETWORK to the existing one"; exit 1; }

echo "== build $RELEASE"
docker compose build

echo "== database"
docker compose up -d postgres
for i in $(seq 1 30); do docker compose exec -T postgres sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' && break; sleep 2; done

if docker compose --profile tools run --rm -T tools sh -c 'psql "$DATABASE_URL" -Atc "select to_regclass($$public.users$$) is not null" | grep -q t'; then
  echo "== pre-deploy backup"
  docker compose --profile tools run --rm -T tools scripts/backup.sh /backups
else
  echo "== first deploy: empty database, no backup needed"
fi

echo "== worker (applies pending migrations first)"
docker compose up -d worker
sleep 8
docker compose logs --tail 30 worker

echo "== web"
docker compose up -d web
for i in $(seq 1 40); do
  if docker compose exec -T web wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "healthy: $RELEASE"; echo "$RELEASE" > .last-good-release; exit 0
  fi
  sleep 3
done
echo "Health check failed for $RELEASE — roll back with: RELEASE=\$(cat deployment/.last-good-release) docker compose -f deployment/docker-compose.yml up -d web worker"
exit 1
