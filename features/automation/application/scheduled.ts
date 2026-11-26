import "server-only";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { formatDateTime } from "@/lib/time";
import { signValue } from "@/lib/security/crypto";
import { enqueueEmail } from "@/features/notifications/application/send";
import { expireStaleOrders, verifyAndApply } from "@/features/commerce/application/fulfilment";
import { pollProcessingRefunds } from "@/features/commerce/application/refunds";
import { publishDuePages } from "@/features/website/application/pages";
import { publishDueArticles } from "@/features/content/application/articles";
import { bookingRepo } from "@/features/bookings/infrastructure/repository";

/** Verifies stale 'initialized' payments with the provider (missed webhooks, closed tabs). */
export async function reconcilePendingPayments(): Promise<{ checked: number; errors: number }> {
  const rows = await db.query<{ provider_reference: string }>(
    `select provider_reference from payments where provider in ('paystack','hubtel') and status = 'initialized'
       and created_at < now() - interval '3 minutes' and created_at > now() - interval '72 hours'
     order by created_at limit 25`,
  );
  let errors = 0;
  for (const r of rows) {
    try {
      await verifyAndApply(r.provider_reference);
    } catch (e) {
      errors++;
      console.error("[reconcile]", r.provider_reference, (e as Error).message);
    }
  }
  // Payments abandoned for more than 72h are closed off.
  await db.query(`update payments set status = 'abandoned' where status = 'initialized' and created_at < now() - interval '72 hours'`);
  return { checked: rows.length, errors };
}

export async function expireHoldsAndOrders(): Promise<number> {
  await bookingRepo.expireStaleHolds();
  await db.query(`update event_registrations set status = 'expired' where status = 'reserved' and hold_expires_at < now() and order_id is null`);
  return expireStaleOrders();
}

const relative = (hours: number) => (hours >= 20 ? "tomorrow" : "in about an hour");

export async function sendAppointmentReminders(): Promise<number> {
  let sent = 0;
  for (const [col, lead, window] of [["reminder_24h_sent_at", 24, 3], ["reminder_1h_sent_at", 1, 0.5]] as const) {
    const due = await db.query<{ id: string; starts_at: Date; customer_timezone: string; email: string; full_name: string; service: string; location_type: string }>(
      `update appointments a set ${col} = now()
         from contacts c, services s
        where c.id = a.contact_id and s.id = a.service_id and a.status = 'confirmed' and a.${col} is null
          and a.starts_at > now() and a.starts_at <= now() + make_interval(hours => $1)
          and a.created_at < a.starts_at - make_interval(mins => $2)
        returning a.id, a.starts_at, a.customer_timezone, c.email, c.full_name, s.name as service, s.location_type`,
      [lead, Math.round(lead * 60 - window * 60)],
    );
    for (const a of due) {
      if (!a.email) continue;
      await enqueueEmail({
        to: a.email,
        template: "appointment_reminder",
        data: {
          name: a.full_name || "there", serviceName: a.service, relative: relative(lead), when: formatDateTime(a.starts_at, a.customer_timezone),
          location: a.location_type === "online" ? "Online — joining details on your booking page" : a.location_type === "phone" ? "Phone call" : "In person",
          manageUrl: `${env().APP_URL}/portal/appointments`,
        },
        idempotencyKey: `appt-reminder:${col}:${a.id}:${a.starts_at.toISOString()}`,
        related: { type: "appointment", id: a.id },
      });
      sent++;
    }
  }
  return sent;
}

export async function sendEventReminders(): Promise<number> {
  let sent = 0;
  for (const [col, lead] of [["reminder_24h_sent_at", 24], ["reminder_1h_sent_at", 1]] as const) {
    const due = await db.query<{ id: string; attendee_email: string; attendee_name: string; event_id: string; title: string; starts_at: Date; timezone: string }>(
      `update event_registrations r set ${col} = now()
         from events e
        where e.id = r.event_id and r.status = 'confirmed' and e.status = 'published' and r.${col} is null
          and e.starts_at > now() and e.starts_at <= now() + make_interval(hours => $1)
          and r.created_at < e.starts_at - make_interval(hours => $1) + interval '30 minutes'
        returning r.id, r.attendee_email, r.attendee_name, e.id as event_id, e.title, e.starts_at, e.timezone`,
      [lead],
    );
    for (const r of due) {
      await enqueueEmail({
        to: r.attendee_email,
        template: "event_reminder",
        data: { name: r.attendee_name || "there", eventTitle: r.title, relative: relative(lead), when: formatDateTime(r.starts_at, r.timezone), portalUrl: `${env().APP_URL}/portal/events/${r.event_id}` },
        idempotencyKey: `event-reminder:${col}:${r.id}:${r.starts_at.toISOString()}`,
        related: { type: "event_registration", id: r.id },
      });
      sent++;
    }
  }
  return sent;
}

export async function sendFollowUps(): Promise<number> {
  const appts = await db.query<{ id: string; email: string; full_name: string; service: string }>(
    `update appointments a set follow_up_sent_at = now() from contacts c, services s
      where c.id = a.contact_id and s.id = a.service_id and a.status in ('confirmed','completed')
        and a.follow_up_sent_at is null and a.ends_at < now() - interval '2 hours' and a.ends_at > now() - interval '3 days'
      returning a.id, c.email, c.full_name, s.name as service`,
  );
  for (const a of appts) {
    if (!a.email) continue;
    await enqueueEmail({
      to: a.email,
      template: "appointment_follow_up",
      data: { name: a.full_name || "there", serviceName: a.service, feedbackUrl: `${env().APP_URL}/testimonials/share`, bookUrl: `${env().APP_URL}/book` },
      idempotencyKey: `appt-followup:${a.id}`,
    });
  }
  const regs = await db.query<{ id: string; attendee_email: string; attendee_name: string; title: string }>(
    `update event_registrations r set feedback_requested_at = now() from events e
      where e.id = r.event_id and e.feedback_enabled and r.status = 'confirmed' and r.feedback_requested_at is null
        and e.ends_at < now() - interval '1 hour' and e.ends_at > now() - interval '3 days'
      returning r.id, r.attendee_email, r.attendee_name, e.title`,
  );
  for (const r of regs) {
    const token = signValue(`feedback:${r.id}`, Math.floor(Date.now() / 1000) + 30 * 86400);
    await enqueueEmail({
      to: r.attendee_email,
      template: "event_feedback_request",
      data: { name: r.attendee_name || "there", eventTitle: r.title, feedbackUrl: `${env().APP_URL}/feedback/${token}` },
      idempotencyKey: `event-feedback:${r.id}`,
    });
  }
  return appts.length + regs.length;
}

/** Publishes due pages/articles, then asks the web app to drop cached public content. */
export async function publishScheduledContent(): Promise<number> {
  const n = (await publishDuePages()) + (await publishDueArticles());
  const events = await db.query(`update events set status = 'completed' where status = 'published' and ends_at < now() - interval '6 hours' returning id`);
  if (n > 0 || events.length > 0) await requestRevalidation(["pages", "articles", "events"]);
  return n;
}

export async function requestRevalidation(tags: string[]): Promise<void> {
  const base = process.env.INTERNAL_APP_URL || env().APP_URL;
  const token = signValue(`revalidate:${tags.join(",")}`, Math.floor(Date.now() / 1000) + 120);
  const res = await fetch(`${base}/api/internal/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": token },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as Response);
  if (!res.ok) throw new Error(`Revalidation request failed: ${res.status} ${res.statusText}`);
}

export async function contentCalendarReminders(): Promise<number> {
  const due = await db.query<{ id: string; title: string; channel: string; planned_for: Date }>(
    `update content_calendar_items set reminder_sent_at = now()
      where reminder_at <= now() and reminder_sent_at is null and status not in ('published','skipped')
      returning id, title, channel, planned_for`,
  );
  if (!due.length) return 0;
  const owner = await db.one<{ email: string }>("select email from users where role = 'owner' order by created_at limit 1");
  if (!owner) return 0;
  for (const d of due) {
    await enqueueEmail({
      to: owner.email,
      template: "task_reminder",
      data: { title: `${d.channel} post: ${d.title}`, message: `Planned for ${d.planned_for.toISOString().slice(0, 16).replace("T", " ")} UTC.`, url: `${env().APP_URL}/admin/content/calendar` },
      idempotencyKey: `calendar-reminder:${d.id}`,
    });
  }
  return due.length;
}

/** Data retention: keep the free-tier database small and minimise personal data. */
export async function cleanup(): Promise<void> {
  await db.query(`delete from rate_limits where window_start < now() - interval '1 day'`);
  await db.query(`delete from sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'`);
  await db.query(`delete from auth_tokens where expires_at < now() - interval '7 days'`);
  await db.query(`delete from jobs where status in ('completed','cancelled') and completed_at < now() - interval '30 days'`);
  await db.query(`delete from jobs where status = 'completed' and completed_at is null and created_at < now() - interval '30 days'`);
  await db.query(`delete from analytics_events where occurred_at < now() - interval '400 days'`);
  await db.query(`delete from link_clicks where clicked_at < now() - interval '400 days'`);
  await db.query(`update notifications set error = null where created_at < now() - interval '90 days' and error is not null`);
  await db.query(`delete from ai_usage where created_at < now() - interval '400 days'`);
}

export { pollProcessingRefunds };
