import { z } from "zod";

/** Contact filter used by list views, saved segments and campaign audiences. */
export const contactFilterSchema = z.object({
  q: z.string().max(100).optional(),
  lifecycle: z.enum(["lead", "customer", "partner"]).optional(),
  stageId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  source: z.string().max(60).optional(),
  consent: z.enum(["yes", "no"]).optional(),
  followUp: z.enum(["overdue", "upcoming"]).optional(),
  minSpentMinor: z.coerce.number().int().min(0).optional(),
  createdAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["recent", "value", "name", "activity"]).optional(),
});
export type ContactFilter = z.infer<typeof contactFilterSchema>;

/** Builds a parameterised WHERE clause (no string interpolation of user values). */
export function contactWhere(f: ContactFilter, startIndex = 1): { sql: string; params: unknown[] } {
  const where = ["c.deleted_at is null"];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${startIndex + params.length - 1}`; };
  if (f.q) {
    const term = p(`%${f.q.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(c.full_name ilike ${term} or c.email::text ilike ${term} or c.company ilike ${term} or c.phone ilike ${term})`);
  }
  if (f.lifecycle) where.push(`c.lifecycle = ${p(f.lifecycle)}`);
  if (f.stageId) where.push(`c.stage_id = ${p(f.stageId)}`);
  if (f.tagId) where.push(`exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = ${p(f.tagId)})`);
  if (f.source) where.push(`c.source = ${p(f.source)}`);
  if (f.consent === "yes") where.push("c.consent_marketing");
  if (f.consent === "no") where.push("not c.consent_marketing");
  if (f.followUp === "overdue") where.push("c.next_follow_up_at < now()");
  if (f.followUp === "upcoming") where.push("c.next_follow_up_at >= now()");
  if (f.minSpentMinor) where.push(`c.total_spent_minor >= ${p(f.minSpentMinor)}`);
  if (f.createdAfter) where.push(`c.created_at >= ${p(f.createdAfter)}::date`);
  return { sql: where.join(" and "), params };
}

export function contactOrder(sort: ContactFilter["sort"]): string {
  switch (sort) {
    case "value": return "c.total_spent_minor desc, c.last_activity_at desc nulls last";
    case "name": return "lower(c.full_name), c.email";
    case "activity": return "c.last_activity_at desc nulls last";
    default: return "c.created_at desc";
  }
}

/** Simple, explainable lead score (0–100) to surface who to follow up with. */
export function leadScore(c: { total_spent_minor: number; consent_marketing: boolean; activity_count: number; last_activity_at: Date | null; has_booking: boolean }): number {
  let s = 0;
  s += Math.min(40, Math.round(c.total_spent_minor / 10000) * 4);
  s += c.has_booking ? 20 : 0;
  s += Math.min(20, c.activity_count * 2);
  s += c.consent_marketing ? 5 : 0;
  if (c.last_activity_at) {
    const days = (Date.now() - new Date(c.last_activity_at).getTime()) / 86400_000;
    s += days < 7 ? 15 : days < 30 ? 8 : 0;
  }
  return Math.min(100, s);
}
