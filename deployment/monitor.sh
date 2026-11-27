#!/usr/bin/env bash
# Health monitor for this stack (cron, every 5 minutes). Writes to the log; on a NEW
# problem it records a high-priority task in Studio (visible on the dashboard) and
# pings HEALTHCHECK_URL/fail if configured. Checks: app health, container state,
# database reachability, disk space and TLS certificate expiry.
set -uo pipefail
cd "$(dirname "$0")"
set -a; [ -f ./.env ] && . ./.env; [ -f .env.backup ] && . ./.env.backup 2>/dev/null; set +a
LOG="${MONITOR_LOG:-$HOME/esther-monitor.log}"
URL="$(grep '^APP_URL=' .env.production | cut -d= -f2-)"
problems=()
code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$URL/api/health" || echo 000)
[ "$code" = 200 ] || problems+=("public health check returned $code")
for s in web worker postgres; do
  st=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$s" '$1==s{print $2}')
  [ "$st" = running ] || problems+=("container $s is ${st:-missing}")
done
docker compose exec -T postgres sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 || problems+=("database not ready")
use=$(df --output=pcent / | tail -1 | tr -dc 0-9); [ "${use:-0}" -lt 85 ] || problems+=("disk ${use}% full")
host=$(echo "$URL" | sed -E 's#https?://([^/]+).*#\1#')
end=$(echo | timeout 10 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$end" ]; then days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 )); [ "$days" -ge 14 ] || problems+=("TLS certificate expires in $days days"); else problems+=("TLS certificate unreadable"); fi
stamp=$(date -u +%FT%TZ)
if [ ${#problems[@]} -eq 0 ]; then echo "$stamp ok (cert ${days:-?}d, disk ${use}%)" >> "$LOG"; [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null; exit 0; fi
msg="$(IFS='; '; echo "${problems[*]}")"; echo "$stamp PROBLEM: $msg" >> "$LOG"
docker compose exec -T postgres sh -c "psql -q -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"insert into tasks (title, notes, priority, dedupe_key) values ('Website monitor: problem detected', \\\$\\\$$msg\\\$\\\$, 'high', 'monitor:' || to_char(now(), 'YYYY-MM-DD-HH24')) on conflict (dedupe_key) do nothing\"" >/dev/null 2>&1
[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL/fail" >/dev/null
exit 1
