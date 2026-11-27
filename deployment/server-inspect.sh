#!/usr/bin/env bash
# READ-ONLY inspection of the Contabo server before deploying. Changes nothing.
#   ssh deploy@<server> 'bash -s' < deployment/server-inspect.sh
echo "== host";      hostnamectl 2>/dev/null | grep -E "Operating|Kernel" ; uptime
echo "== cpu/mem";   nproc; free -h
echo "== disk";      df -h / /var/lib/docker 2>/dev/null
echo "== docker";    docker version --format 'client {{.Client.Version}} / server {{.Server.Version}}' 2>&1; docker compose version 2>&1 | head -1
echo "== containers (name, image, status, ports)"; docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1
echo "== container resource use"; docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>&1 | head -40
echo "== networks";  docker network ls --format '{{.Name}}\t{{.Driver}}' 2>&1
echo "== proxy candidates"; docker ps --format '{{.Names}} {{.Image}}' | grep -iE 'caddy|traefik|nginx|proxy' ; systemctl is-active caddy nginx traefik 2>/dev/null
echo "== listening ports"; ss -ltnp 2>/dev/null | awk 'NR==1||/:(80|443|5432|3000|3100|6379)\b/'
echo "== postgres"; docker ps --format '{{.Names}} {{.Image}}' | grep -i postgres; systemctl is-active postgresql 2>/dev/null
echo "== backups/cron"; ls /etc/cron.d 2>/dev/null; crontab -l 2>/dev/null | grep -v '^#' | head
echo "== this project already present?"; docker ps -a --format '{{.Names}}' | grep -i brand-platform || echo none
