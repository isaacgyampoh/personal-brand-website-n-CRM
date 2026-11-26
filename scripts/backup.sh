#!/usr/bin/env bash
# Encrypted logical backup of the application database.
#   DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh [output-dir]
# Produces <dir>/brand-<UTC timestamp>.dump.enc (pg_dump custom format, AES-256 via openssl).
# Keeps the newest $BACKUP_KEEP files (default 14). Upload the file off-server (e.g. R2) with
# `aws s3 cp --endpoint-url https://<account>.r2.cloudflarestorage.com` from cron.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required (store it in a password manager, NOT on this server only)}"
DIR="${1:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/brand-$STAMP.dump.enc"
pg_dump --format=custom --no-owner --no-privileges --exclude-table-data=rate_limits "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
openssl dgst -sha256 "$OUT" | awk '{print $2}' > "$OUT.sha256"
ls -1t "$DIR"/brand-*.dump.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"
