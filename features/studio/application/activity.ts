import "server-only";
import { db } from "@/lib/database/pool";
import type { SessionUser } from "@/lib/auth/session";

export type ActivityItem = { at: Date; kind: string; title: string; detail: string; href: string | null; tone: "green" | "blue" | "amber" | "red" | "gray" };

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "signed in", "auth.mfa_failed": "failed a two-factor check", "auth.login_failed": "failed sign-in",
  "integration.configure": "changed integration settings", "integration.enable": "enabled an integration", "integration.disable": "disabled an integration",
  "integration.test_ok": "verified an integration", "integration.test_failed": "integration test failed", "refund.request": "requested a refund",
  "refund.confirm_manual": "confirmed a manual refund", "event.quick_create": "created a masterclass", "event.publish": "published a masterclass",
  "event.cancel": "cancelled a masterclass", "user.invite": "invited a team member", "user.role": "changed a team member's role",
  "finance.export_transactions": "exported transactions", "finance.export_orders": "exported orders", "auth.mfa_enabled": "turned on two-factor authentication",
};

/**
 * One feed of what is happening in the business: customer activity (bookings,
 * payments, registrations, forms), staff actions (audit log) and delivery
 * problems. Each source requires its own permission.
 */
export async function activityFeed(user: SessionUser, opts: { kind?: string; limit?: number } = {}): Promise<ActivityItem[]> {
  const limit = Math.min(opts.limit ?? 60, 200);
  const jobs: Promise<ActivityItem[]>[] = [];
  const want = (k: string) => !opts.kind || opts.kind === k;
  if (user.permissions.has("crm:view") && want("customers")) {
    jobs.push(db.query<{ occurred_at: Date; kind: string; title: string; contact_id: string; who: string }>(
      `select a.occurred_at, a.kind, a.title, a.contact_id, coalesce(nullif(c.full_name,''), c.email::text, c.phone) as who
         from crm_activities a join contacts c on c.id = a.contact_id order by a.occurred_at desc limit $1`, [limit],
    ).then((r) => r.map((a) => ({
      at: a.occurred_at, kind: a.kind, title: `${a.who}: ${a.title}`, detail: a.kind.replace("_", " "), href: `/admin/crm/${a.contact_id}`,
      tone: ["payment", "purchase", "booking", "registration", "enrolment"].includes(a.kind) ? "green" as const : a.kind === "refund" ? "amber" as const : "blue" as const,
    }))));
  }
  if (user.permissions.has("audit:view") && want("team")) {
    jobs.push(db.query<{ created_at: Date; action: string; entity_type: string; entity_id: string | null; who: string | null; actor_label: string | null }>(
      `select l.created_at, l.action, l.entity_type, l.entity_id, coalesce(nullif(u.full_name,''), u.email::text) as who, l.actor_label
         from audit_logs l left join users u on u.id = l.actor_id where l.action not like 'auth.login%' or l.action = 'auth.login_failed'
        order by l.created_at desc limit $1`, [limit],
    ).then((r) => r.map((l) => ({
      at: l.created_at, kind: "team", title: `${l.who ?? l.actor_label ?? "System"} ${ACTION_LABEL[l.action] ?? l.action.replace(/[._]/g, " ")}`,
      detail: `${l.entity_type}${l.entity_id ? ` · ${l.entity_id.slice(0, 40)}` : ""}`, href: null,
      tone: /failed|cancel/.test(l.action) ? "red" as const : "gray" as const,
    }))));
  }
  if (user.permissions.has("jobs:manage") && want("problems")) {
    jobs.push(db.query<{ created_at: Date; recipient: string; template_key: string; error: string | null }>(
      `select created_at, recipient, template_key, error from notifications where status = 'failed' order by created_at desc limit 20`,
    ).then((r) => r.map((n) => ({ at: n.created_at, kind: "problem", title: `Email to ${n.recipient} failed`, detail: `${n.template_key}${n.error ? ` · ${n.error.slice(0, 80)}` : ""}`, href: "/admin/system?tab=notifications", tone: "red" as const }))));
    jobs.push(db.query<{ at: Date; type: string; last_error: string | null }>(
      `select coalesce(locked_at, created_at) as at, type, last_error from jobs where status = 'dead' order by id desc limit 20`,
    ).then((r) => r.map((j) => ({ at: j.at, kind: "problem", title: `Background task failed: ${j.type}`, detail: j.last_error?.slice(0, 100) ?? "", href: "/admin/system", tone: "red" as const }))));
  }
  return (await Promise.all(jobs)).flat().sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
