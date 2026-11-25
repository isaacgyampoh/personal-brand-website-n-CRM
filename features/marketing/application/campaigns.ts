import "server-only";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { enqueue } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";
import { enqueueEmail } from "@/features/notifications/application/send";

/**
 * Consent-based email campaigns. Audiences only ever include confirmed
 * newsletter subscribers (double opt-in); suppressed addresses are excluded.
 */
export const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all_subscribers") }),
  z.object({ type: z.literal("list"), listId: z.string().uuid() }),
  z.object({ type: z.literal("tag"), tagId: z.string().uuid() }),
]);
export type Audience = z.infer<typeof audienceSchema>;

function audienceSql(a: Audience): { sql: string; params: unknown[] } {
  const base = `select s.id, s.email from subscribers s
     where s.status = 'subscribed' and not exists (select 1 from email_suppressions x where x.email = s.email)`;
  if (a.type === "list") return { sql: `${base} and exists (select 1 from subscriber_lists l where l.subscriber_id = s.id and l.list_id = $1)`, params: [a.listId] };
  if (a.type === "tag") {
    return { sql: `${base} and exists (select 1 from contacts c join contact_tags ct on ct.contact_id = c.id where c.email = s.email and ct.tag_id = $1)`, params: [a.tagId] };
  }
  return { sql: base, params: [] };
}

export async function audienceSize(a: Audience): Promise<number> {
  const { sql, params } = audienceSql(a);
  const row = await db.one<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params);
  return row?.n ?? 0;
}

/** Freezes the recipient list and starts sending in batches. */
export async function startCampaign(campaignId: string, actorId: string | null): Promise<number> {
  return tx(async (t) => {
    const c = await t.one<{ id: string; status: string; audience: unknown }>("select id, status, audience from campaigns where id = $1 for update", [campaignId]);
    if (!c || !["draft", "scheduled"].includes(c.status)) throw new Error("Campaign can't be sent in its current state.");
    const audience = audienceSchema.parse(c.audience);
    const { sql, params } = audienceSql(audience);
    const rows = await t.query(
      `insert into campaign_recipients (campaign_id, subscriber_id) select $${params.length + 1}, q.id from (${sql}) q
       on conflict do nothing returning subscriber_id`,
      [...params, campaignId],
    );
    await t.query("update campaigns set status = 'sending', started_at = now() where id = $1", [campaignId]);
    await enqueue("campaign.send_batch", { campaignId }, { idempotencyKey: `campaign-batch:${campaignId}:0` }, t);
    await audit({ actorId, actorLabel: actorId ? undefined : "scheduler", action: "campaign.start", entityType: "campaign", entityId: campaignId, data: { recipients: rows.length } }, t);
    return rows.length;
  });
}

/** Job: queue up to 100 recipient emails, then re-enqueue itself until done. */
export async function sendCampaignBatch(campaignId: string): Promise<void> {
  const c = await db.one<{ id: string; subject: string; body: string; preheader: string; status: string }>("select * from campaigns where id = $1", [campaignId]);
  if (!c || c.status !== "sending") return;
  const batch = await db.query<{ subscriber_id: string; email: string; full_name: string }>(
    `select r.subscriber_id, s.email, s.full_name from campaign_recipients r join subscribers s on s.id = r.subscriber_id
      where r.campaign_id = $1 and r.status = 'queued' limit 100`,
    [campaignId],
  );
  for (const r of batch) {
    const notificationId = await enqueueEmail({
      to: r.email,
      template: "campaign",
      data: { subject: c.subject, content: c.body.replace(/\{\{\s*name\s*\}\}/g, r.full_name || "there") },
      idempotencyKey: `campaign:${campaignId}:${r.subscriber_id}`,
      related: { type: "campaign", id: campaignId },
    });
    await db.query(
      `update campaign_recipients set status = 'accepted', notification_id = $3, sent_at = now() where campaign_id = $1 and subscriber_id = $2`,
      [campaignId, r.subscriber_id, notificationId],
    );
  }
  const remaining = await db.one<{ n: number }>("select count(*)::int as n from campaign_recipients where campaign_id = $1 and status = 'queued'", [campaignId]);
  if ((remaining?.n ?? 0) > 0) {
    await enqueue("campaign.send_batch", { campaignId }, { idempotencyKey: `campaign-batch:${campaignId}:${Date.now()}`, runAt: new Date(Date.now() + 30_000) });
  } else {
    await db.query("update campaigns set status = 'sent', sent_at = now() where id = $1 and status = 'sending'", [campaignId]);
  }
}

export async function startDueCampaigns(): Promise<number> {
  const due = await db.query<{ id: string }>("select id from campaigns where status = 'scheduled' and scheduled_at <= now()");
  for (const c of due) await startCampaign(c.id, null);
  return due.length;
}
