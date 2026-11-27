#!/usr/bin/env bash
# Restores an encrypted backup into a TARGET database.
#   TARGET_DATABASE_URL=... BACKUP_PASSPHRASE=... CONFIRM_RESTORE=yes scripts/restore.sh backups/brand-XXXX.dump.enc
# Safety: refuses to restore over the live database (LIVE_DATABASE_URL / DATABASE_URL) and refuses a
# target that already contains accounts unless FORCE_RESTORE_INTO_NONEMPTY=yes (disaster recovery only).
set -euo pipefail
FILE="${1:?usage: restore.sh <backup.dump.enc>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
LIVE="${LIVE_DATABASE_URL:-${DATABASE_URL:-}}"
dbname() { psql "$1" -X -A -t -c "select current_database() || '@' || coalesce(inet_server_addr()::text,'local') || ':' || current_setting('port')"; }
if [ -n "$LIVE" ] && [ "$(dbname "$TARGET_DATABASE_URL")" = "$(dbname "$LIVE")" ]; then
  echo "REFUSED: the target is the live database. Restore into a separate database and switch over deliberately."; exit 2
fi
if [ -f "$FILE.sha256" ]; then
  [ "$(openssl dgst -sha256 "$FILE" | awk '{print $2}')" = "$(cat "$FILE.sha256")" ] || { echo "checksum mismatch"; exit 1; }
fi
HAS_USERS="$(psql "$TARGET_DATABASE_URL" -X -A -t -c "select to_regclass('public.users') is not null and exists (select 1 from users)" 2>/dev/null || echo f)"
if [ "$HAS_USERS" = "t" ] && [ "${FORCE_RESTORE_INTO_NONEMPTY:-}" != "yes" ]; then
  echo "REFUSED: target already contains user accounts. Use an empty database (or FORCE_RESTORE_INTO_NONEMPTY=yes for disaster recovery)."; exit 2
fi
if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then echo "Set CONFIRM_RESTORE=yes to restore into $(dbname "$TARGET_DATABASE_URL")"; exit 1; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
  | pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error -d "$TARGET_DATABASE_URL"
echo "restore complete"
