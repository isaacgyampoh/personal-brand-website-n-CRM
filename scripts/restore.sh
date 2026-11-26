#!/usr/bin/env bash
# Restores an encrypted backup into a TARGET database (never the live one by accident).
#   TARGET_DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/restore.sh backups/brand-XXXX.dump.enc
set -euo pipefail
FILE="${1:?usage: restore.sh <backup.dump.enc>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
if [ -f "$FILE.sha256" ]; then
  [ "$(openssl dgst -sha256 "$FILE" | awk '{print $2}')" = "$(cat "$FILE.sha256")" ] || { echo "checksum mismatch"; exit 1; }
fi
if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then echo "Set CONFIRM_RESTORE=yes to restore into $TARGET_DATABASE_URL"; exit 1; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
  | pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error -d "$TARGET_DATABASE_URL"
echo "restore complete"
