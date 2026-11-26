#!/usr/bin/env bash
# Repeatable deploy on the Contabo host (run from the repo checkout on the server).
#   RELEASE=$(git rev-parse --short HEAD) ENV_FILE=.env.production deployment/deploy.sh
# Steps: backup DB -> build images -> start worker (runs migrations) -> start web -> health check.
# On failure the previous images are still tagged; see ROLLBACK in docs/DEPLOYMENT.md.
set -euo pipefail
cd "$(dirname "$0")"
RELEASE="${RELEASE:-$(git rev-parse --short HEAD)}"
ENV_FILE="${ENV_FILE:-.env.production}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy ../.env.example and fill it in)"; exit 1; }
set -a; . "./$ENV_FILE"; set +a
echo "== pre-deploy backup"
BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in $ENV_FILE}" ../scripts/backup.sh "${BACKUP_DIR:-/var/backups/brand-platform}"
echo "== build $RELEASE"
RELEASE="$RELEASE" docker compose build
echo "== start worker (applies migrations first)"
RELEASE="$RELEASE" docker compose up -d worker
sleep 10
docker compose logs --tail 20 worker | grep -q "applying\|started" || true
echo "== start web"
RELEASE="$RELEASE" docker compose up -d web
for i in $(seq 1 30); do
  if docker compose exec -T web wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then echo "healthy: $RELEASE"; echo "$RELEASE" > .last-good-release; exit 0; fi
  sleep 3
done
echo "Health check failed for $RELEASE — roll back with: RELEASE=\$(cat .last-good-release) docker compose up -d"
exit 1
