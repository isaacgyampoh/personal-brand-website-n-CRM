#!/usr/bin/env bash
# Imports an encrypted data export (from scripts/backup.sh on the old host) into a FRESHLY
# DEPLOYED stack whose schema was created by our migrations. Runs in the tools container
# with the web and worker containers STOPPED (no duplicate background jobs).
#
#   docker compose --profile tools run --rm tools scripts/import-data.sh /backups/brand-XXXX.dump.enc
#
# Schema comes from migrations (owned by the least-privilege app role); only DATA is
# imported, as the admin role, with triggers disabled during the load. The target must
# not yet hold real data unless FORCE_IMPORT=yes.
set -euo pipefail
FILE="${1:?usage: import-data.sh <backup.dump.enc>}"
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
APPDB="$(node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.pathname.slice(1))')"
TARGET="$(node -e 'const u=new URL(process.argv[1]);u.pathname="/"+process.argv[2];console.log(u.toString())' "$ADMIN_DATABASE_URL" "$APPDB")"
[ "$(openssl dgst -sha256 "$FILE" | awk '{print $2}')" = "$(cat "$FILE.sha256")" ] || { echo "checksum mismatch"; exit 1; }
REAL_USERS="$(psql "$TARGET" -XAtc "select count(*) from users")"
if [ "$REAL_USERS" -gt 1 ] && [ "${FORCE_IMPORT:-}" != "yes" ]; then
  echo "REFUSED: target already has $REAL_USERS accounts. Import only into a fresh deployment (or FORCE_IMPORT=yes)."; exit 2
fi
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$WORK/dump"
# Same migration level on both sides, or refuse.
pg_restore -f - -a -t schema_migrations "$WORK/dump" | grep -oE "^[0-9]{14}[a-z_]*" | sort > "$WORK/src" || true
psql "$TARGET" -XAtc "select version from schema_migrations order by 1" | sort > "$WORK/dst"
diff -q "$WORK/src" "$WORK/dst" >/dev/null || { echo "Migration level differs between export and target — deploy the same release first."; diff "$WORK/src" "$WORK/dst" || true; exit 3; }
# Data only, excluding the migration ledger and transient rate limits.
pg_restore -l "$WORK/dump" | grep -E "TABLE DATA|SEQUENCE SET" | grep -vE " (schema_migrations|rate_limits) " > "$WORK/list"
psql "$TARGET" -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('schema_migrations') loop
    execute format('alter table public.%I disable trigger all', r.tablename);
  end loop;
  execute (select 'truncate ' || string_agg(format('public.%I', tablename), ', ') || ' restart identity cascade'
             from pg_tables where schemaname = 'public' and tablename not in ('schema_migrations'));
end $$;
SQL
pg_restore --data-only --no-owner --disable-triggers --exit-on-error -L "$WORK/list" -d "$TARGET" "$WORK/dump"
psql "$TARGET" -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('schema_migrations') loop
    execute format('alter table public.%I enable trigger all', r.tablename);
  end loop;
end $$;
-- Sessions and pending setup links from the old host are not carried over.
update auth_tokens set used_at = now() where used_at is null;
update sessions set revoked_at = now() where revoked_at is null;
-- Jobs that were mid-flight on the old host become runnable again here, exactly once.
update jobs set status = 'pending', locked_at = null, locked_by = null where status = 'running';
SQL
# Verify the imported database itself against the export's manifest (read-only checks).
if [ -f "$FILE.manifest.enc" ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE.manifest.enc" -out "$WORK/manifest.json"
  VERIFY_DATABASE_URL="$TARGET" MANIFEST_JSON="$WORK/manifest.json" npx tsx --tsconfig tsconfig.worker.json scripts/verify-restore.ts
fi
echo "data imported into $APPDB"
