import "server-only";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { logActivity, upsertContact } from "./contacts";
import { contactOrder, contactWhere, type ContactFilter } from "../domain/segments";

export class CrmError extends UserError {}

export type ContactListRow = {
  id: string; email: string | null; full_name: string; phone: string | null; company: string; lifecycle: string;
  stage_id: string | null; stage_name: string | null; stage_color: string | null; source: string; consent_marketing: boolean;
  total_spent_minor: number; last_activity_at: Date | null; next_follow_up_at: Date | null; created_at: Date; tags: { name: string; color: string }[];
};

export async function listContacts(f: ContactFilter, page = 1, pageSize = 50) {
  const { sql, params } = contactWhere(f);
  const rows = await db.query<ContactListRow>(
    `select c.*, s.name as stage_name, s.color as stage_color,
       coalesce((select json_agg(json_build_object('name', t.name, 'color', t.color)) from contact_tags ct join crm_tags t on t.id = ct.tag_id where ct.contact_id = c.id), '[]') as tags
     from contacts c left join pipeline_stages s on s.id = c.stage_id
     where ${sql} order by ${contactOrder(f.sort)} limit ${pageSize + 1} offset ${(page - 1) * pageSize}`,
    params,
  );
  const total = await db.one<{ n: number }>(`select count(*)::int as n from contacts c where ${sql}`, params);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, total: total?.n ?? 0 };
}

export async function exportContacts(f: ContactFilter): Promise<ContactListRow[]> {
  const { sql, params } = contactWhere(f);
  return db.query<ContactListRow>(
    `select c.*, s.name as stage_name,
       coalesce((select json_agg(json_build_object('name', t.name, 'color', t.color)) from contact_tags ct join crm_tags t on t.id = ct.tag_id where ct.contact_id = c.id), '[]') as tags
     from contacts c left join pipeline_stages s on s.id = c.stage_id where ${sql} order by c.created_at desc limit 50000`,
    params,
  );
}

export async function contactProfile(id: string) {
  const contact = await db.one<ContactListRow & { job_title: string; attribution: Record<string, unknown>; consent_at: Date | null; consent_source: string | null; user_id: string | null }>(
    `select c.*, s.name as stage_name, s.color as stage_color,
       coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) from contact_tags ct join crm_tags t on t.id = ct.tag_id where ct.contact_id = c.id), '[]') as tags
     from contacts c left join pipeline_stages s on s.id = c.stage_id where c.id = $1 and c.deleted_at is null`,
    [id],
  );
  if (!contact) return null;
  const [activities, tasks, appointments, orders, registrations, enrolments, duplicates, subscriber] = await Promise.all([
    db.query<{ id: string; kind: string; title: string; body: string; occurred_at: Date; actor: string | null }>(
      `select a.id, a.kind, a.title, a.body, a.occurred_at, u.full_name as actor from crm_activities a left join users u on u.id = a.actor_id
        where a.contact_id = $1 order by a.occurred_at desc limit 100`, [id]),
    db.query<{ id: string; title: string; due_at: Date | null; status: string; priority: string }>(
      "select id, title, due_at, status, priority from tasks where contact_id = $1 order by status = 'open' desc, due_at nulls last limit 50", [id]),
    db.query<{ id: string; reference: string; starts_at: Date; status: string; service: string }>(
      "select a.id, a.reference, a.starts_at, a.status, s.name as service from appointments a join services s on s.id = a.service_id where a.contact_id = $1 order by a.starts_at desc", [id]),
    db.query<{ id: string; reference: string; status: string; total_minor: number; currency: string; created_at: Date; items: string }>(
      `select o.id, o.reference, o.status, o.total_minor, o.currency, o.created_at, string_agg(i.description, ', ') as items
         from orders o join order_items i on i.order_id = o.id where o.contact_id = $1 group by o.id order by o.created_at desc`, [id]),
    db.query<{ id: string; reference: string; status: string; title: string; starts_at: Date; attended_at: Date | null }>(
      "select r.id, r.reference, r.status, e.title, e.starts_at, r.attended_at from event_registrations r join events e on e.id = r.event_id where r.contact_id = $1 order by e.starts_at desc", [id]),
    db.query<{ id: string; status: string; title: string; enrolled_at: Date; progress: number }>(
      `select en.id, en.status, c.title, en.enrolled_at,
         coalesce(round(100.0 * (select count(*) from lesson_progress lp where lp.enrolment_id = en.id and lp.completed_at is not null) / nullif((select count(*) from lessons l where l.course_id = c.id),0)),0)::int as progress
         from enrolments en join courses c on c.id = en.course_id where en.contact_id = $1`, [id]),
    findDuplicates(id),
    db.one<{ status: string }>("select status from subscribers where email = $1", [contact.email]),
  ]);
  return { contact, activities, tasks, appointments, orders, registrations, enrolments, duplicates, subscriber };
}

/** Potential duplicates: same phone, or same name with a different email. */
export async function findDuplicates(id: string) {
  return db.query<{ id: string; full_name: string; email: string | null; phone: string | null; reason: string }>(
    `select o.id, o.full_name, o.email, o.phone,
            case when o.phone is not null and o.phone = c.phone then 'same phone' else 'same name' end as reason
       from contacts c join contacts o on o.id <> c.id and o.deleted_at is null
      where c.id = $1 and ((c.phone is not null and regexp_replace(o.phone, '\\D', '', 'g') = regexp_replace(c.phone, '\\D', '', 'g'))
         or (length(c.full_name) > 4 and lower(o.full_name) = lower(c.full_name)))
      limit 10`,
    [id],
  );
}

export const contactInput = z.object({
  fullName: z.string().trim().max(200).default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).default(""),
  phone: z.string().trim().max(32).default(""),
  company: z.string().trim().max(150).default(""),
  jobTitle: z.string().trim().max(150).default(""),
  lifecycle: z.enum(["lead", "customer", "partner"]).default("lead"),
  stageId: z.union([z.literal(""), z.string().uuid()]).default(""),
  source: z.string().trim().max(60).default("manual"),
  consentMarketing: z.boolean().default(false),
  nextFollowUpAt: z.string().default(""),
});

export async function createContact(raw: unknown, actorId: string): Promise<string> {
  const i = contactInput.parse(raw);
  if (!i.email && !i.phone) throw new CrmError("Add an email or phone number.");
  return tx(async (t) => {
    if (i.email) {
      const dup = await t.one<{ id: string }>("select id from contacts where email = $1 and deleted_at is null", [i.email]);
      if (dup) throw new CrmError("A contact with this email already exists.");
    }
    const { id } = await upsertContact(t, {
      email: i.email || null, fullName: i.fullName, phone: i.phone || null, company: i.company, jobTitle: i.jobTitle,
      source: i.source, lifecycle: i.lifecycle, consentMarketing: i.consentMarketing, consentSource: "Recorded manually by staff",
    });
    if (i.stageId) await t.query("update contacts set stage_id = $2 where id = $1", [id, i.stageId]);
    await logActivity(t, id, "system", "Contact created manually", { actorId });
    await audit({ actorId, action: "contact.create", entityType: "contact", entityId: id }, t);
    return id;
  });
}

export async function updateContact(id: string, raw: unknown, actorId: string) {
  const i = contactInput.parse(raw);
  if (!i.email && !i.phone) throw new CrmError("Add an email or phone number.");
  await tx(async (t) => {
    const prev = await t.one<{ stage_id: string | null; consent_marketing: boolean }>("select stage_id, consent_marketing from contacts where id = $1 for update", [id]);
    if (!prev) throw new CrmError("Contact not found.");
    try {
      await t.query("savepoint upd");
      await t.query(
        `update contacts set full_name=$2, email=nullif($3,''), phone=nullif($4,''), company=$5, job_title=$6, lifecycle=$7, stage_id=nullif($8,'')::uuid,
           source=$9, next_follow_up_at = nullif($10,'')::timestamptz,
           consent_marketing=$11, consent_at = case when $11 and not consent_marketing then now() else consent_at end,
           consent_source = case when $11 and not consent_marketing then 'Recorded manually by staff' else consent_source end
         where id = $1`,
        [id, i.fullName, i.email, i.phone, i.company, i.jobTitle, i.lifecycle, i.stageId, i.source, i.nextFollowUpAt, i.consentMarketing],
      );
      await t.query("release savepoint upd");
    } catch (e) {
      await t.query("rollback to savepoint upd");
      if ((e as { code?: string }).code === "23505") throw new CrmError("Another contact already uses this email.");
      throw e;
    }
    if ((prev.stage_id ?? "") !== i.stageId) {
      const st = await t.one<{ name: string }>("select name from pipeline_stages where id = $1", [i.stageId || null]);
      await logActivity(t, id, "stage_change", `Moved to ${st?.name ?? "no stage"}`, { actorId });
    }
    if (prev.consent_marketing !== i.consentMarketing) {
      await logActivity(t, id, "consent", i.consentMarketing ? "Marketing consent recorded by staff" : "Marketing consent withdrawn", { actorId });
    }
    await audit({ actorId, action: "contact.update", entityType: "contact", entityId: id }, t);
  });
}

export async function setStage(contactId: string, stageId: string, actorId: string) {
  await tx(async (t) => {
    const st = await t.one<{ name: string; kind: string }>("select name, kind from pipeline_stages where id = $1", [stageId]);
    if (!st) throw new CrmError("Stage not found.");
    await t.query(`update contacts set stage_id = $2, lifecycle = case when $3 = 'won' and lifecycle = 'lead' then 'customer' else lifecycle end where id = $1`, [contactId, stageId, st.kind]);
    await logActivity(t, contactId, "stage_change", `Moved to ${st.name}`, { actorId });
  });
}

export async function addNote(contactId: string, kind: "note" | "call" | "meeting" | "email", title: string, body: string, actorId: string) {
  await tx((t) => logActivity(t, contactId, kind, title || kind, { body, actorId }));
}

export async function setTags(contactId: string, names: string[], actorId: string) {
  await tx(async (t) => {
    await t.query("delete from contact_tags where contact_id = $1", [contactId]);
    for (const n of names.map((x) => x.trim()).filter(Boolean).slice(0, 20)) {
      const tag = await t.one<{ id: string }>("insert into crm_tags (name) values ($1) on conflict (name) do update set name = crm_tags.name returning id", [n.slice(0, 40)]);
      await t.query("insert into contact_tags (contact_id, tag_id) values ($1,$2) on conflict do nothing", [contactId, tag!.id]);
    }
    await audit({ actorId, action: "contact.tags", entityType: "contact", entityId: contactId, data: { names } }, t);
  });
}

/** Merges `sourceId` into `targetId`, moving all history, then soft-deletes the source. */
export async function mergeContacts(targetId: string, sourceId: string, actorId: string) {
  if (targetId === sourceId) throw new CrmError("Choose two different contacts.");
  await tx(async (t) => {
    const [target, source] = await Promise.all([
      t.one<{ id: string; email: string | null; user_id: string | null }>("select id, email, user_id from contacts where id = $1 for update", [targetId]),
      t.one<{ id: string; email: string | null; user_id: string | null; total_spent_minor: number }>("select id, email, user_id, total_spent_minor from contacts where id = $1 for update", [sourceId]),
    ]);
    if (!target || !source) throw new CrmError("Contact not found.");
    if (target.user_id && source.user_id && target.user_id !== source.user_id) throw new CrmError("Both contacts belong to different user accounts; they can't be merged automatically.");
    for (const table of ["crm_activities", "tasks", "orders", "appointments", "event_registrations", "entitlements", "form_submissions", "opportunities", "certificates", "event_waitlist", "assessment_responses", "discount_redemptions"]) {
      await t.query(`update ${table} set contact_id = $1 where contact_id = $2`, [targetId, sourceId]);
    }
    await t.query(`insert into enrolments (course_id, contact_id, user_id, order_id, status, enrolled_at)
                   select course_id, $1, user_id, order_id, status, enrolled_at from enrolments where contact_id = $2 on conflict do nothing`, [targetId, sourceId]);
    await t.query("insert into contact_tags (contact_id, tag_id) select $1, tag_id from contact_tags where contact_id = $2 on conflict do nothing", [targetId, sourceId]);
    await t.query(
      `update contacts set total_spent_minor = total_spent_minor + $2, user_id = coalesce(user_id, $3),
         phone = coalesce(phone, (select phone from contacts where id = $4)) where id = $1`,
      [targetId, source.total_spent_minor, source.user_id, sourceId],
    );
    await t.query("update contacts set deleted_at = now(), email = null, phone = coalesce(phone, 'merged'), user_id = null where id = $1", [sourceId]);
    await logActivity(t, targetId, "system", `Merged duplicate contact${source.email ? ` (${source.email})` : ""}`, { actorId });
    await audit({ actorId, action: "contact.merge", entityType: "contact", entityId: targetId, data: { sourceId } }, t);
  });
}

export async function deleteContact(id: string, actorId: string) {
  // GDPR-style erasure keeps financial records (legal obligation) but anonymises the person.
  await tx(async (t) => {
    const hasMoney = await t.one("select 1 from orders where contact_id = $1 and status in ('paid','refunded','partially_refunded')", [id]);
    await t.query(
      `update contacts set deleted_at = now(), full_name = 'Deleted contact', email = null, phone = 'deleted-' || left(id::text, 8),
         company = '', job_title = '', attribution = '{}', consent_marketing = false where id = $1`,
      [id],
    );
    await t.query("delete from crm_activities where contact_id = $1 and kind in ('note','call','meeting','email','form')", [id]);
    await t.query("delete from contact_tags where contact_id = $1", [id]);
    await audit({ actorId, action: "contact.delete", entityType: "contact", entityId: id, data: { financialRecordsRetained: Boolean(hasMoney) } }, t);
  });
}

// ---------------- Tasks ----------------
export async function saveTask(input: { id?: string; title: string; notes?: string; contactId?: string | null; dueAt?: string; priority?: string }, actorId: string) {
  const title = input.title.trim();
  if (!title) throw new CrmError("Task title is required.");
  if (input.id) {
    await db.query("update tasks set title=$2, notes=$3, due_at=nullif($4,'')::timestamptz, priority=$5 where id=$1", [input.id, title, input.notes ?? "", input.dueAt ?? "", input.priority ?? "normal"]);
  } else {
    await db.query(
      "insert into tasks (title, notes, contact_id, due_at, priority, created_by, assigned_to) values ($1,$2,$3,nullif($4,'')::timestamptz,$5,$6,$6)",
      [title, input.notes ?? "", input.contactId || null, input.dueAt ?? "", input.priority ?? "normal", actorId],
    );
  }
}

export async function setTaskStatus(id: string, status: "open" | "done" | "cancelled") {
  await db.query("update tasks set status = $2, completed_at = case when $2 = 'done' then now() else null end where id = $1", [id, status]);
}

export const pipelineStages = () => db.query<{ id: string; name: string; position: number; kind: string; color: string }>("select * from pipeline_stages order by position");
export const allTags = () => db.query<{ id: string; name: string; color: string; n: number }>("select t.*, (select count(*) from contact_tags ct where ct.tag_id = t.id)::int as n from crm_tags t order by t.name");
