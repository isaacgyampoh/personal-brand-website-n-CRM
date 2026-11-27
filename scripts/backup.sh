#!/usr/bin/env bash
# Encrypted logical backup of THIS application's database only.
#   DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh [output-dir]
# Writes <dir>/brand-<UTC>.dump.enc (pg_dump custom format, AES-256-CBC + PBKDF2 via openssl),
# a SHA-256 checksum and an encrypted manifest of business totals used to verify restores.
# Keeps the newest $BACKUP_KEEP local files (default 14). Off-site copy: see deployment/backup-and-ship.sh.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required (store it in a password manager, NOT on this server only)}"
DIR="${1:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
HERE="$(cd "$(dirname "$0")" && pwd)"
umask 077
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/brand-$STAMP.dump.enc"
# Manifest first, inside the same snapshot window as closely as possible.
psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f "$HERE/backup-manifest.sql" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT.manifest.enc"
pg_dump --format=custom --no-owner --no-privileges --exclude-table-data=rate_limits "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
openssl dgst -sha256 "$OUT" | awk '{print $2}' > "$OUT.sha256"
ls -1t "$DIR"/brand-*.dump.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do rm -f "$f" "$f.sha256" "$f.manifest.enc"; done
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"
