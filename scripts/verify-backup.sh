#!/usr/bin/env bash
# Test-restores a backup into a throwaway database and verifies it. Never touches the live database.
#   ADMIN_DATABASE_URL=postgres://.../postgres  LIVE_DATABASE_URL=...  BACKUP_PASSPHRASE=...  CREDENTIALS_MASTER_KEYS=... \
#     scripts/verify-backup.sh backups/brand-XXXX.dump.enc
set -euo pipefail
FILE="${1:?usage: verify-backup.sh <backup.dump.enc>}"
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL (maintenance database on the same server) is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="brand_verify_$(date -u +%Y%m%d%H%M%S)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"; psql "$ADMIN_DATABASE_URL" -X -q -c "drop database if exists $NAME with (force)" >/dev/null 2>&1 || true' EXIT
psql "$ADMIN_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "create database $NAME"
TARGET="$(node -e 'const u=new URL(process.argv[1]); u.pathname="/"+process.argv[2]; console.log(u.toString())' "$ADMIN_DATABASE_URL" "$NAME")"
TARGET_DATABASE_URL="$TARGET" CONFIRM_RESTORE=yes "$HERE/restore.sh" "$FILE"
if [ -f "$FILE.manifest.enc" ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE.manifest.enc" -out "$WORK/manifest.json"
fi
cd "$HERE/.." && VERIFY_DATABASE_URL="$TARGET" MANIFEST_JSON="$WORK/manifest.json" npx tsx --tsconfig tsconfig.worker.json scripts/verify-restore.ts
