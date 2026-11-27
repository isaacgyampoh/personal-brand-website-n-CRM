#!/usr/bin/env bash
# Nightly job on the Contabo host (cron). Everything runs inside the app's own
# `tools` container — no database tools needed on the host:
#   encrypted backup → off-site copy to R2 (verified) → test restore into a
#   throwaway database with relationship + credential checks → retention → alert on failure.
# Secrets: deployment/.env.production (app) + deployment/.env.backup (backup-only), both chmod 600.
set -uo pipefail
cd "$(dirname "$0")"
set -a; [ -f ./.env ] && . ./.env; . "${BACKUP_ENV_FILE:-.env.backup}"; set +a   # stack name, backup dir, passphrase
LOG="${BACKUP_LOG:-/var/log/brand-backup.log}"
REMOTE_KEEP_DAYS="${REMOTE_KEEP_DAYS:-35}"
exec >>"$LOG" 2>&1
echo "=== $(date -u +%FT%TZ) backup start"
run() { docker compose --profile tools run --rm -T tools "$@"; }

fail() {
  echo "FAILED: $1"
  # Shows in Studio (Dashboard tasks + Activity) — no paid alerting service needed.
  run node -e 'const {Client}=require("pg");(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query("insert into tasks (title, notes, priority, dedupe_key) values ($1,$2,'"'"'high'"'"',$3) on conflict (dedupe_key) do nothing",["Database backup failed",process.argv[1],"backup-failed:"+new Date().toISOString().slice(0,10)]);await c.end()})().catch(()=>process.exit(1))' "$1 — see $LOG on the server" || true
  [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL/fail" >/dev/null || true
  exit 1
}

run scripts/backup.sh /backups || fail "backup step failed"
LATEST="$(ls -1t "${BACKUP_DIR:-/var/backups/brand-platform}"/brand-*.dump.enc | head -1)"
NAME="$(basename "$LATEST")"
OFFSITE=0; grep -q '^BACKUP_R2_BUCKET=.\+' "${BACKUP_ENV_FILE:-.env.backup}" 2>/dev/null && OFFSITE=1
if [ "$OFFSITE" = 1 ]; then
  run npx tsx scripts/offsite.ts upload "/backups/$NAME" "/backups/$NAME.sha256" "/backups/$NAME.manifest.enc" || fail "off-site upload/verification failed"
else
  echo "NOTICE: off-site copy not configured (no BACKUP_R2_* in .env.backup) — backup kept on this server only"
fi
# restore.sh treats DATABASE_URL as the live database and refuses to restore into it.
run scripts/verify-backup.sh "/backups/$NAME" || fail "restore verification failed for $NAME"
[ "$OFFSITE" = 1 ] && { run npx tsx scripts/offsite.ts prune "$REMOTE_KEEP_DAYS" || fail "off-site retention step failed"; }
# Media (uploaded photos/files) — encrypted archive alongside the database backup while R2 is not in use.
docker compose run --rm -T --no-deps --entrypoint sh -v "${BACKUP_DIR:-/var/backups/brand-platform}":/backups web -c 'tar -czf - -C /app/.data storage' \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "${BACKUP_DIR:-/var/backups/brand-platform}/media-$(date -u +%Y%m%dT%H%M%SZ).tgz.enc" || fail "media archive failed"
ls -1t "${BACKUP_DIR:-/var/backups/brand-platform}"/media-*.tgz.enc 2>/dev/null | tail -n +8 | xargs -r rm -f
[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null || true
echo "=== $(date -u +%FT%TZ) backup OK: $NAME"
