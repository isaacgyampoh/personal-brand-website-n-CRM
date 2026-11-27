#!/usr/bin/env bash
# Moves the temporary staging (this Mac) to the server WITHOUT losing anything:
# database records, accounts (incl. MFA), content, uploaded media, settings and encrypted
# integration credentials (by carrying over APP_SECRET + CREDENTIALS_MASTER_KEYS).
#
#   SERVER=deploy@<host> deployment/migrate-staging-to-server.sh
#
# Order: stop the Mac worker (no duplicate jobs) → encrypted export → copy to server →
# server: deploy same release (stopped) → import data + media → verify → start.
# The Mac web stays up as the rollback until the server passes acceptance; restart its
# worker (`.data/staging/run.sh worker`) only if you roll back.
set -euo pipefail
: "${SERVER:?SERVER=deploy@host is required}"
cd "$(dirname "$0")/.."
KEY="${DEPLOY_KEY:-$HOME/.ssh/brand_platform_deploy_ed25519}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes "$SERVER")
DEST="${DEST:-/opt/brand-platform}"
ST=.data/staging
[ -f "$ST/env" ] || { echo "No staging environment found"; exit 1; }
umask 077
OUT="$ST/export-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$OUT"

echo "== stop staging worker (web keeps serving)"; pkill -f "run.sh worker" || true; pkill -f "workers/worker.ts" || true
echo "== encrypted export"
openssl rand -base64 33 | tr -d '\n' > "$OUT/passphrase"
BACKUP_PASSPHRASE="$(cat "$OUT/passphrase")" DATABASE_URL="postgres://localhost/brand_staging?host=/tmp" scripts/backup.sh "$OUT" | tail -1
COPYFILE_DISABLE=1 tar -C "$ST" -czf "$OUT/media.tgz" storage 2>/dev/null || tar -czf "$OUT/media.tgz" -T /dev/null
grep -E '^(APP_SECRET|CREDENTIALS_MASTER_KEYS)=' "$ST/env" > "$OUT/keys.env"

echo "== copy to server (encrypted dump; keys + passphrase over SSH only)"
"${SSH[@]}" "mkdir -p $DEST/shared/import && chmod 700 $DEST/shared/import"
scp -i "$KEY" -o IdentitiesOnly=yes "$OUT"/brand-*.dump.enc* "$OUT/media.tgz" "$OUT/keys.env" "$OUT/passphrase" "$SERVER:$DEST/shared/import/"

echo "== server: carry keys into .env.production, deploy, import, verify"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd $DEST/shared
for k in APP_SECRET CREDENTIALS_MASTER_KEYS; do
  v="\$(grep "^\$k=" import/keys.env | cut -d= -f2-)"
  grep -v "^\$k=" .env.production > .env.tmp && echo "\$k=\$v" >> .env.tmp && mv .env.tmp .env.production && chmod 600 .env.production
done
cd $DEST/current/deployment
docker compose stop web worker 2>/dev/null || true
F=\$(ls -1t $DEST/shared/import/brand-*.dump.enc | head -1)
cp \$F* /var/backups/brand-platform/
N=\$(basename \$F)
docker compose --profile tools run --rm -T -e BACKUP_PASSPHRASE="\$(cat $DEST/shared/import/passphrase)" tools scripts/import-data.sh /backups/\$N
docker compose run --rm -T --no-deps --entrypoint sh -v $DEST/shared/import:/import web -c 'tar -xzf /import/media.tgz -C /app/.data && ls /app/.data/storage | head'
docker compose up -d worker web
shred -u $DEST/shared/import/passphrase $DEST/shared/import/keys.env 2>/dev/null || rm -f $DEST/shared/import/passphrase $DEST/shared/import/keys.env
REMOTE
rm -f "$OUT/passphrase" "$OUT/keys.env"
echo "Migration complete. Run the acceptance suite against the server URL before retiring the Mac staging."
