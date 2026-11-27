import "server-only";
import { db, type Db } from "@/lib/database/pool";
import { enqueue } from "@/lib/jobs/queue";
import { env } from "@/lib/config/env";
import { loadSettings } from "@/features/settings/application/settings";
import { DEFAULT_TEMPLATES, escapeHtml, renderEmail } from "../domain/templates";
import { emailTransport } from "../infrastructure/email-transport";
import { sendSms } from "../infrastructure/sms-mnotify";

export type EmailRequest = {
  to: string;
  template: keyof typeof DEFAULT_TEMPLATES | string;
  data: Record<string, unknown>;
  /** Same key => same notification (never sent twice). */
  idempotencyKey: string;
  related?: { type: string; id: string };
  runAt?: Date;
  attachments?: { kind: "receipt"; orderId: string }[];
};

/**
 * Records a notification and schedules delivery on the durable job queue.
 * Returns the notification id (existing id if the key was already used).
 */
export async function enqueueEmail(req: EmailRequest, executor: Db = db): Promise<string> {
  const def = DEFAULT_TEMPLATES[req.template];
  const inserted = await executor.one<{ id: string }>(
    `insert into notifications (channel, recipient, template_key, status, related_type, related_id, idempotency_key)
     values ('email', $1, $2, 'queued', $3, $4, $5)
     on conflict (idempotency_key) do nothing returning id`,
    [req.to.toLowerCase(), req.template, req.related?.type ?? null, req.related?.id ?? null, req.idempotencyKey],
  );
  if (!inserted) {
    const existing = await executor.one<{ id: string }>("select id from notifications where idempotency_key = $1", [req.idempotencyKey]);
    return existing!.id;
  }
  await enqueue(
    "notification.email",
    { notificationId: inserted.id, data: req.data, marketing: Boolean(def?.marketing), attachments: req.attachments ?? [] },
    { runAt: req.runAt, idempotencyKey: `notification:${inserted.id}`, maxAttempts: 6 },
    executor,
  );
  return inserted.id;
}

export async function enqueueSms(to: string, message: string, idempotencyKey: string, related?: { type: string; id: string }) {
  const inserted = await db.one<{ id: string }>(
    `insert into notifications (channel, recipient, template_key, status, related_type, related_id, idempotency_key)
     values ('sms', $1, 'sms', 'queued', $2, $3, $4) on conflict (idempotency_key) do nothing returning id`,
    [to, related?.type ?? null, related?.id ?? null, idempotencyKey],
  );
  if (inserted) {
    await enqueue("notification.sms", { notificationId: inserted.id, message }, { idempotencyKey: `notification:${inserted.id}` });
  }
}

async function templateFor(key: string): Promise<{ subject: string; body: string }> {
  const override = await db.one<{ subject: string; body: string }>("select subject, body from email_templates where key = $1", [key]);
  if (override) return override;
  const def = DEFAULT_TEMPLATES[key];
  if (!def) throw new Error(`Unknown email template "${key}"`);
  return def;
}

/** Job handler: renders and sends one email notification. */
export async function deliverEmail(payload: {
  notificationId: string;
  data: Record<string, unknown>;
  marketing?: boolean;
  attachments?: { kind: "receipt"; orderId: string }[];
}): Promise<void> {
  const n = await db.one<{ id: string; recipient: string; template_key: string; status: string }>(
    "select id, recipient, template_key, status from notifications where id = $1",
    [payload.notificationId],
  );
  if (!n) return;
  if (["accepted", "delivered", "suppressed", "skipped"].includes(n.status)) return; // already done (idempotent)

  const suppression = await db.one<{ reason: string }>("select reason from email_suppressions where email = $1", [n.recipient]);
  if (suppression && (payload.marketing || suppression.reason !== "unsubscribed")) {
    await db.query("update notifications set status = 'suppressed', error = $2 where id = $1", [n.id, `suppressed: ${suppression.reason}`]);
    return;
  }

  const settings = await loadSettings();
  if (await deferredByDailyLimit(n.id, settings.email.dailyLimit, Boolean(payload.marketing), payload)) return;

  await db.query("update notifications set status = 'sending' where id = $1", [n.id]);
  const def = await templateFor(n.template_key);
  const data = { ...payload.data, brandName: settings.brand.name };

  let footerHtml = "";
  const headers: Record<string, string> = {};
  if (payload.marketing) {
    const sub = await db.one<{ unsubscribe_token: string }>("select unsubscribe_token from subscribers where email = $1", [n.recipient]);
    if (sub) {
      const unsub = `${env().APP_URL}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
      footerHtml = `<br><br><a href="${escapeHtml(unsub)}" style="color:#777">Unsubscribe</a>`;
      headers["List-Unsubscribe"] = `<${unsub}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  }
  const rendered = renderEmail(def, data, {
    brandName: settings.email.fromName || settings.brand.name,
    accent: settings.theme.accent,
    ink: settings.theme.ink,
    paper: settings.theme.paper,
    footer: settings.email.footerText || settings.brand.name,
  }, footerHtml);

  const attachments = [];
  for (const a of payload.attachments ?? []) {
    if (a.kind === "receipt") {
      const { renderReceiptPdf } = await import("@/features/commerce/application/receipts");
      const pdf = await renderReceiptPdf(a.orderId);
      if (pdf) attachments.push({ filename: `${pdf.number}.pdf`, content: Buffer.from(pdf.bytes), contentType: "application/pdf" });
    }
  }

  try {
    const result = await (await emailTransport()).send({
      to: n.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      fromName: settings.email.fromName || settings.brand.name,
      replyTo: settings.email.replyTo || settings.contact.email || undefined,
      headers,
      attachments,
    });
    // "accepted" = provider accepted the message. Not proof of delivery.
    await db.query(
      `update notifications set status = 'accepted', subject = $2, provider = $3, provider_message_id = $4, sent_at = now(), error = null where id = $1`,
      [n.id, rendered.subject, result.provider, result.messageId],
    );
  } catch (error) {
    await db.query("update notifications set status = 'failed', error = $2 where id = $1", [
      n.id,
      (error as Error).message.slice(0, 1000),
    ]);
    throw error; // let the queue retry with backoff
  }
}

/** Emails handed to the provider since 00:00 UTC (the provider's daily window). */
export async function emailsSentToday(): Promise<number> {
  const r = await db.one<{ n: number }>("select count(*)::int as n from notifications where channel = 'email' and sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'");
  return r?.n ?? 0;
}

/** Room kept for password resets, invitations and confirmations once marketing reaches its share. */
const TRANSACTIONAL_RESERVE = 50;

/**
 * Respects the email provider's free daily allowance: at the limit the email waits
 * for the next day (00:05 UTC) instead of failing; marketing stops earlier so
 * transactional mail always has room. Warns the owner once a day at 80%.
 */
async function deferredByDailyLimit(id: string, limit: number, marketing: boolean, payload: Record<string, unknown>): Promise<boolean> {
  if (!limit) return false;
  const sent = await emailsSentToday();
  const day = new Date().toISOString().slice(0, 10);
  if (sent >= Math.floor(limit * 0.8)) {
    await db.query(
      `insert into tasks (title, notes, priority, dedupe_key) values ($1, $2, 'high', $3) on conflict (dedupe_key) do nothing`,
      ["Email allowance nearly used", `${sent} of ${limit} emails sent today (provider's free daily limit). Further emails wait until tomorrow; nothing is upgraded automatically.`, `email-limit:${day}`],
    );
  }
  const cap = marketing ? Math.max(0, limit - TRANSACTIONAL_RESERVE) : limit;
  if (sent < cap) return false;
  const next = new Date(`${day}T00:05:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  await db.query("update notifications set status = 'queued', error = $2 where id = $1", [id, `waiting: daily email limit (${limit}) reached — sends after ${next.toISOString()}`]);
  await enqueue("notification.email", payload, { runAt: next, idempotencyKey: `notification:${id}:${day}`, maxAttempts: 6 });
  return true;
}

export async function deliverSms(payload: { notificationId: string; message: string }): Promise<void> {
  const n = await db.one<{ id: string; recipient: string; status: string }>("select id, recipient, status from notifications where id = $1", [payload.notificationId]);
  if (!n || n.status === "accepted" || n.status === "delivered") return;
  try {
    const r = await sendSms(n.recipient, payload.message);
    await db.query("update notifications set status = 'accepted', provider = $2, provider_message_id = $3, sent_at = now() where id = $1", [n.id, r.provider, r.messageId]);
  } catch (error) {
    await db.query("update notifications set status = 'failed', error = $2 where id = $1", [n.id, (error as Error).message.slice(0, 1000)]);
    throw error;
  }
}

/** Alert the business owner (admin alert email + dashboard task). */
export async function alertAdmin(title: string, message: string, dedupeKey: string, executor: Db = db): Promise<void> {
  await executor.query(
    `insert into tasks (title, notes, priority, dedupe_key) values ($1, $2, 'high', $3) on conflict (dedupe_key) do nothing`,
    [title.slice(0, 300), message, `alert:${dedupeKey}`],
  );
  const settings = await loadSettings(executor);
  const to = settings.email.adminAlertEmail || settings.contact.email;
  if (to) {
    await enqueueEmail(
      { to, template: "admin_alert", data: { title, message, adminUrl: `${env().APP_URL}/admin` }, idempotencyKey: `admin-alert:${dedupeKey}` },
      executor,
    );
  }
}
