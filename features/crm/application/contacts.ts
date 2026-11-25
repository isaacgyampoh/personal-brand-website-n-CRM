import "server-only";
import { db, type Db } from "@/lib/database/pool";

export type ContactInput = {
  email?: string | null;
  fullName?: string;
  phone?: string | null;
  company?: string;
  jobTitle?: string;
  source?: string;
  attribution?: Record<string, unknown>;
  consentMarketing?: boolean;
  consentSource?: string;
  lifecycle?: "lead" | "customer" | "partner";
};

export type ActivityKind =
  | "note" | "email" | "call" | "meeting" | "form" | "booking" | "payment" | "registration"
  | "enrolment" | "purchase" | "stage_change" | "consent" | "system" | "refund" | "assessment";

/**
 * Find-or-create a contact by email (case-insensitive). Never overwrites
 * existing non-empty fields with blanks; never downgrades consent silently
 * (withdrawal happens only via explicit unsubscribe / admin action).
 */
export async function upsertContact(t: Db, input: ContactInput): Promise<{ id: string; created: boolean }> {
  const email = input.email?.trim().toLowerCase() || null;
  if (!email && !input.phone) throw new Error("A contact needs an email or phone number");
  const defaultStage = await t.one<{ id: string }>("select id from pipeline_stages order by position limit 1");

  if (email) {
    const existing = await t.one<{ id: string }>(
      `update contacts set
         full_name = case when full_name = '' then coalesce($2, '') else full_name end,
         phone = coalesce(phone, $3),
         company = case when company = '' then coalesce($4, '') else company end,
         job_title = case when job_title = '' then coalesce($5, '') else job_title end,
         consent_marketing = consent_marketing or $6,
         consent_at = case when $6 and not consent_marketing then now() else consent_at end,
         consent_source = case when $6 and not consent_marketing then $7 else consent_source end,
         lifecycle = case when $8 = 'customer' then 'customer' else lifecycle end,
         last_activity_at = now()
       where email = $1 and deleted_at is null returning id`,
      [email, input.fullName ?? null, input.phone ?? null, input.company ?? null, input.jobTitle ?? null,
       Boolean(input.consentMarketing), input.consentSource ?? null, input.lifecycle ?? null],
    );
    if (existing) return { id: existing.id, created: false };
  }

  const created = await t.one<{ id: string }>(
    `insert into contacts (email, full_name, phone, company, job_title, source, attribution, consent_marketing,
        consent_at, consent_source, lifecycle, stage_id, last_activity_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, case when $8 then now() end, $9, $10, $11, now())
     on conflict (email) where email is not null and deleted_at is null do update set last_activity_at = now()
     returning id`,
    [email, input.fullName ?? "", input.phone ?? null, input.company ?? "", input.jobTitle ?? "",
     input.source ?? "website", JSON.stringify(input.attribution ?? {}), Boolean(input.consentMarketing),
     input.consentMarketing ? input.consentSource ?? input.source ?? "website" : null, input.lifecycle ?? "lead",
     defaultStage?.id ?? null],
  );
  return { id: created!.id, created: true };
}

export async function logActivity(
  t: Db,
  contactId: string,
  kind: ActivityKind,
  title: string,
  opts: { body?: string; data?: Record<string, unknown>; actorId?: string | null } = {},
): Promise<void> {
  await t.query(
    `insert into crm_activities (contact_id, kind, title, body, data, actor_id) values ($1, $2, $3, $4, $5, $6)`,
    [contactId, kind, title.slice(0, 300), opts.body ?? "", JSON.stringify(opts.data ?? {}), opts.actorId ?? null],
  );
  await t.query("update contacts set last_activity_at = now() where id = $1", [contactId]);
}

/**
 * Associates purchases made with `email` to the user account — ONLY when the
 * account's email has been verified (magic link or verification email).
 */
export async function attachVerifiedUser(userId: string, executor: Db = db): Promise<void> {
  const user = await executor.one<{ email: string; email_verified_at: Date | null; full_name: string }>(
    "select email, email_verified_at, full_name from users where id = $1",
    [userId],
  );
  if (!user?.email_verified_at) return;
  const contact = await executor.one<{ id: string }>(
    `update contacts set user_id = $1,
        full_name = case when full_name = '' then $3 else full_name end
      where email = $2 and deleted_at is null and (user_id is null or user_id = $1) returning id`,
    [userId, user.email, user.full_name],
  );
  if (!contact) return;
  for (const table of ["orders", "appointments", "event_registrations", "enrolments", "entitlements", "certificates"]) {
    await executor.query(`update ${table} set user_id = $1 where contact_id = $2 and user_id is null`, [userId, contact.id]);
  }
}

/** Contact linked to a signed-in user (via verified email association). */
export async function contactForUser(userId: string): Promise<{ id: string } | null> {
  await attachVerifiedUser(userId);
  return db.one<{ id: string }>("select id from contacts where user_id = $1 and deleted_at is null", [userId]);
}
