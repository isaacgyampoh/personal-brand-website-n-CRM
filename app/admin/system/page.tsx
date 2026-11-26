import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { jobAction } from "@/features/settings/presentation/actions";
import { formatInZone } from "@/lib/time";
import { PageTitle, Panel, Stat, Table, Td, StatusBadge, Notice } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";

export const metadata = { title: "Jobs & logs" };

export default async function SystemPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const user = await requireStaffPage("jobs:manage");
  const sp = await searchParams;
  const tab = sp.tab ?? "jobs";
  const tz = (await loadSetting("business")).timezone;
  const [health, counts] = await Promise.all([
    db.one<{ db_bytes: number; heartbeat: Date | null; rows: Record<string, number> }>(
      `select pg_database_size(current_database())::bigint as db_bytes,
         (select max(completed_at) from jobs where type like 'cron.%') as heartbeat,
         json_build_object('contacts', (select count(*) from contacts), 'orders', (select count(*) from orders), 'analytics_events', (select count(*) from analytics_events), 'notifications', (select count(*) from notifications), 'jobs', (select count(*) from jobs)) as rows`),
    db.query<{ status: string; n: number }>("select status, count(*)::int as n from jobs group by status"),
  ]);
  const workerStale = !health?.heartbeat || Date.now() - health.heartbeat.getTime() > 5 * 60_000;
  const c = Object.fromEntries(counts.map((x) => [x.status, x.n]));
  const mb = (health?.db_bytes ?? 0) / 1048576;
  return (
    <div className="space-y-6">
      <PageTitle title="Jobs, notifications & audit" />
      {workerStale && <Notice tone="red">The background worker hasn&apos;t completed a scheduled task in the last 5 minutes. Reminders, emails, reconciliation and scheduled publishing need it running (<span className="font-mono">pnpm worker</span> / the worker container).</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Database size" value={`${mb.toFixed(1)} MB`} hint="Dedicated PostgreSQL database" />
        <Stat label="Worker heartbeat" value={health?.heartbeat ? formatInZone(health.heartbeat, tz, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "never"} />
        <Stat label="Pending jobs" value={c.pending ?? 0} /><Stat label="Running" value={c.running ?? 0} /><Stat label="Failed permanently" value={c.dead ?? 0} />
      </div>
      <nav className="flex gap-1 border-b">{[["jobs", "Jobs"], ["notifications", "Notifications"], ["audit", "Audit log"]].filter(([k]) => k !== "audit" || user.permissions.has("audit:view")).map(([k, l]) => <Link key={k} href={`/admin/system?tab=${k}`} className={`border-b-2 px-3 py-2 text-sm ${tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}>{l}</Link>)}</nav>
      {tab === "jobs" && <Jobs status={sp.status} tz={tz} />}
      {tab === "notifications" && <Notifications tz={tz} />}
      {tab === "audit" && user.permissions.has("audit:view") && <Audit tz={tz} />}
      <Panel title="Row counts"><p className="font-mono text-xs">{JSON.stringify(health?.rows)}</p></Panel>
    </div>
  );
}

async function Jobs({ status, tz }: { status?: string; tz: string }) {
  const rows = await db.query<{ id: number; type: string; status: string; attempts: number; max_attempts: number; run_at: Date; last_error: string | null; created_at: Date }>(
    `select * from jobs where ($1::text is null and type not like 'cron.%' or status = $1) order by id desc limit 200`, [status ?? null]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">{["", "pending", "running", "dead", "completed"].map((s) => <Link key={s} href={`/admin/system?tab=jobs${s ? `&status=${s}` : ""}`} className={`rounded-full border px-3 py-1 ${(status ?? "") === s ? "bg-foreground text-background" : "bg-background"}`}>{s || "Recent"}</Link>)}</div>
      <Table head={["Job", "Status", "Attempts", "Next run / error", ""]}>
        {rows.map((j) => <tr key={j.id}><Td className="font-mono text-xs">#{j.id} {j.type}</Td><Td><StatusBadge status={j.status} /></Td><Td>{j.attempts}/{j.max_attempts}</Td><Td className="max-w-md text-xs">{j.last_error ? <span className="text-red-700">{j.last_error}</span> : formatInZone(j.run_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
          <Td>{["dead", "failed", "cancelled"].includes(j.status) && <ActionButton action={jobAction} fields={{ id: String(j.id), op: "retry" }} label="Retry" />}{j.status === "pending" && <ActionButton action={jobAction} fields={{ id: String(j.id), op: "cancel" }} label="Cancel" />}</Td></tr>)}
      </Table>
    </div>
  );
}

async function Notifications({ tz }: { tz: string }) {
  const rows = await db.query<{ id: string; channel: string; recipient: string; template_key: string; subject: string | null; status: string; provider: string | null; error: string | null; created_at: Date }>("select * from notifications order by created_at desc limit 200");
  return (
    <Table head={["When", "To", "Template", "Status", "Detail"]}>
      {rows.map((n) => <tr key={n.id}><Td className="text-xs">{formatInZone(n.created_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td><Td className="text-xs">{n.recipient}</Td><Td className="text-xs">{n.template_key}<div className="text-muted-foreground">{n.subject}</div></Td><Td><StatusBadge status={n.status} /></Td><Td className="max-w-xs text-xs text-muted-foreground">{n.error ?? n.provider}</Td></tr>)}
    </Table>
  );
}

async function Audit({ tz }: { tz: string }) {
  const rows = await db.query<{ id: number; action: string; entity_type: string; entity_id: string | null; actor: string | null; created_at: Date; data: unknown }>(
    "select l.id, l.action, l.entity_type, l.entity_id, coalesce(u.email::text, l.actor_label) as actor, l.created_at, l.data from audit_logs l left join users u on u.id = l.actor_id order by l.id desc limit 300");
  return (
    <Table head={["When", "Who", "Action", "Entity", "Data"]}>
      {rows.map((a) => <tr key={a.id}><Td className="text-xs">{formatInZone(a.created_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td><Td className="text-xs">{a.actor ?? "system"}</Td><Td className="font-mono text-xs">{a.action}</Td><Td className="text-xs">{a.entity_type} {a.entity_id?.slice(0, 12)}</Td><Td className="max-w-xs truncate font-mono text-[10px] text-muted-foreground">{JSON.stringify(a.data)}</Td></tr>)}
    </Table>
  );
}
