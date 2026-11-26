# Running on Supabase Free — verified limits, risks, mitigations

Limits verified from https://supabase.com/pricing on **2026-11-26**. Re-check before relying on them; Supabase changes plans.

| Resource | Free plan | How this app stays within it |
|---|---|---|
| Database size | 500 MB per project | Media never stored in Postgres (R2). Analytics stores minimal rows (no IPs, no payloads); retention job deletes analytics/link clicks after 400 days, completed jobs after 30 days, rate-limit rows after 1 day. DB size is shown in Admin → Jobs & logs. |
| Egress | 5 GB (+5 GB cached) | Browser never talks to Supabase; only the server does. Public pages served from the app's data cache; images from R2/Cloudflare. |
| File storage | 1 GB | Not used — Cloudflare R2 holds all files. |
| Auth MAUs | 50,000 | Ample for one business. |
| Active projects | 2 | Use one for production; staging can use local/self-hosted Postgres. |
| Realtime | 200 concurrent / 2M msgs | Not used (no Realtime subscriptions, no polling of Supabase). |
| Edge Functions | 500,000 invocations | Not used. |
| Logs | 1 day retention | App logs go to Docker logs on Contabo. |
| **Pausing** | **Paused after 1 week of inactivity** | The worker queries the database every few seconds and the scheduler every 30 s, so a running worker keeps the project active. If the worker is down for a week, the project can pause and the site will fail. Monitor the worker heartbeat (Admin → Jobs & logs shows a red warning). |
| **Backups** | **Automatic backups: Not included. PITR: Not included.** | **You must run the independent encrypted backups** (`scripts/backup.sh`, nightly cron in `deployment/backup.cron`, copied off-server to R2). Restoration was tested — see the delivery report. |

Cheapest paid plan: **Pro from $25/month** (8 GB disk, 250 GB egress, 7-day automatic backups, no pausing). Do not upgrade without the owner's approval.

## Recommendation

Supabase Free is fine for development, staging and a soft launch with test payments. **Before taking real customer payments** either (a) upgrade to Pro for managed backups and no pausing, or (b) move the database to self-hosted PostgreSQL on Contabo (see MIGRATION.md) with the nightly backup cron and a tested restore. Real payments should not depend on a database that has no provider backups and can pause.
