import "server-only";
import { db, tx } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { upsertContact, logActivity } from "@/features/crm/application/contacts";
import { enqueueEmail } from "@/features/notifications/application/send";

export const NEWSLETTER_CONSENT_TEXT = "I agree to receive the newsletter by email. I can unsubscribe at any time.";

/** Double opt-in subscription. Nothing is sent until the address is confirmed. */
export async function subscribe(input: { email: string; fullName?: string; source: string; attribution?: Record<string, unknown> }) {
  const email = input.email.trim().toLowerCase();
  const token = randomToken(24);
  await tx(async (t) => {
    const existing = await t.one<{ id: string; status: string }>("select id, status from subscribers where email = $1 for update", [email]);
    if (existing?.status === "subscribed") return;
    const { id: contactId } = await upsertContact(t, { email, fullName: input.fullName, source: input.source, attribution: input.attribution });
    if (existing) {
      await t.query(
        `update subscribers set status = 'pending', confirm_token_hash = $2, consent_text = $3, source = $4, contact_id = $5 where id = $1`,
        [existing.id, hashToken(token), NEWSLETTER_CONSENT_TEXT, input.source, contactId],
      );
    } else {
      await t.query(
        `insert into subscribers (email, contact_id, full_name, status, source, consent_text, confirm_token_hash, unsubscribe_token)
         values ($1,$2,$3,'pending',$4,$5,$6,$7)`,
        [email, contactId, input.fullName ?? "", input.source, NEWSLETTER_CONSENT_TEXT, hashToken(token), randomToken(24)],
      );
    }
    await enqueueEmail({
      to: email,
      template: "newsletter_confirm",
      data: { confirmUrl: `${env().APP_URL}/newsletter/confirm?token=${token}` },
      idempotencyKey: `newsletter-confirm:${hashToken(token)}`,
    }, t);
  });
}

export async function confirmSubscription(token: string): Promise<boolean> {
  if (!token || token.length > 64) return false;
  return tx(async (t) => {
    const sub = await t.one<{ id: string; email: string; contact_id: string | null }>(
      `update subscribers set status = 'subscribed', confirmed_at = now(), confirm_token_hash = null, unsubscribed_at = null
        where confirm_token_hash = $1 and status = 'pending' returning id, email, contact_id`,
      [hashToken(token)],
    );
    if (!sub) return false;
    await t.query("delete from email_suppressions where email = $1 and reason = 'unsubscribed'", [sub.email]);
    const list = await t.one<{ id: string }>("select id from mailing_lists where name = 'Newsletter'");
    if (list) await t.query("insert into subscriber_lists (subscriber_id, list_id) values ($1,$2) on conflict do nothing", [sub.id, list.id]);
    if (sub.contact_id) {
      await t.query(
        `update contacts set consent_marketing = true, consent_at = now(), consent_source = 'newsletter double opt-in' where id = $1`,
        [sub.contact_id],
      );
      await logActivity(t, sub.contact_id, "consent", "Confirmed newsletter subscription");
    }
    return true;
  });
}

export async function unsubscribe(token: string): Promise<boolean> {
  if (!token || token.length > 64) return false;
  return tx(async (t) => {
    const sub = await t.one<{ email: string; contact_id: string | null }>(
      `update subscribers set status = 'unsubscribed', unsubscribed_at = now() where unsubscribe_token = $1 returning email, contact_id`,
      [token],
    );
    if (!sub) return false;
    await t.query(`insert into email_suppressions (email, reason) values ($1, 'unsubscribed') on conflict (email) do nothing`, [sub.email]);
    if (sub.contact_id) {
      await t.query(`update contacts set consent_marketing = false where id = $1`, [sub.contact_id]);
      await logActivity(t, sub.contact_id, "consent", "Unsubscribed from email marketing");
    }
    return true;
  });
}

export async function subscriberCounts() {
  return db.one<{ subscribed: number; pending: number; unsubscribed: number }>(
    `select count(*) filter (where status = 'subscribed')::int as subscribed,
            count(*) filter (where status = 'pending')::int as pending,
            count(*) filter (where status = 'unsubscribed')::int as unsubscribed from subscribers`,
  );
}
