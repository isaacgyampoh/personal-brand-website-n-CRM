/**
 * Job type → handler map. Every handler must be idempotent: it may run more
 * than once (retries, worker crash mid-job).
 */
import { deliverEmail, deliverSms } from "@/features/notifications/application/send";
import { processWebhookEvent } from "@/features/payments/application/webhooks";
import { submitRefund } from "@/features/commerce/application/refunds";
import { offerWaitlistSeats } from "@/features/events/application/registration";
import { syncAppointmentToCalendar } from "@/features/integrations/application/google-calendar";
import { sendCampaignBatch } from "@/features/marketing/application/campaigns";
import * as scheduled from "@/features/automation/application/scheduled";

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

export const handlers: Record<string, Handler> = {
  "notification.email": (p) => deliverEmail(p as Parameters<typeof deliverEmail>[0]),
  "notification.sms": (p) => deliverSms(p as Parameters<typeof deliverSms>[0]),
  "payment.webhook": (p) => processWebhookEvent(String(p.eventId)),
  "payment.refund": (p) => submitRefund(String(p.refundId)),
  "events.waitlist_offer": (p) => offerWaitlistSeats(String(p.eventId)),
  "calendar.sync_appointment": (p) => syncAppointmentToCalendar(String(p.appointmentId)),
  "campaign.send_batch": (p) => sendCampaignBatch(String(p.campaignId)),

  // Periodic tasks (enqueued by the scheduler in worker.ts)
  "cron.reconcile_payments": () => scheduled.reconcilePendingPayments(),
  "cron.expire_holds": () => scheduled.expireHoldsAndOrders(),
  "cron.reminders": async () => ({ appts: await scheduled.sendAppointmentReminders(), events: await scheduled.sendEventReminders() }),
  "cron.follow_ups": () => scheduled.sendFollowUps(),
  "cron.publish_scheduled": () => scheduled.publishScheduledContent(),
  "cron.refunds": () => scheduled.pollProcessingRefunds(),
  "cron.calendar_reminders": () => scheduled.contentCalendarReminders(),
  "cron.campaigns": async () => {
    const { startDueCampaigns } = await import("@/features/marketing/application/campaigns");
    return startDueCampaigns();
  },
  "cron.cleanup": () => scheduled.cleanup(),
};

/** Periodic schedule: [job type, interval in minutes]. */
export const SCHEDULE: [string, number][] = [
  ["cron.expire_holds", 1],
  ["cron.reconcile_payments", 5],
  ["cron.reminders", 5],
  ["cron.publish_scheduled", 1],
  ["cron.campaigns", 1],
  ["cron.follow_ups", 30],
  ["cron.refunds", 15],
  ["cron.calendar_reminders", 5],
  ["cron.cleanup", 24 * 60],
];
