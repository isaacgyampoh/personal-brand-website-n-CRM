import "server-only";
import { db, type Db } from "@/lib/database/pool";
import type { Busy, Exception, ServiceRules, WeeklyRule } from "../domain/availability";

export type ServiceRow = {
  id: string; slug: string; name: string; category: string; summary: string; description: unknown;
  image_media_id: string | null; price_minor: number; currency: string; price_display: string;
  duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number; slot_interval_minutes: number;
  min_notice_minutes: number; max_advance_days: number; capacity: number; booking_mode: "instant" | "enquiry" | "none";
  location_type: "online" | "in_person" | "phone"; location_details: string; meeting_provider: string;
  default_meeting_url: string | null; cancel_cutoff_hours: number; reschedule_cutoff_hours: number;
  max_reschedules: number; refund_on_cancel: boolean; cancellation_policy: string; is_active: boolean;
  featured: boolean; sort_order: number; is_demo: boolean;
};

export type AppointmentRow = {
  id: string; reference: string; service_id: string; contact_id: string; user_id: string | null; order_id: string | null;
  starts_at: Date; ends_at: Date; slot_group: string; status: string; hold_expires_at: Date | null;
  customer_timezone: string; customer_notes: string; internal_notes: string; meeting_url: string | null;
  meeting_details: string; reschedule_count: number; cancelled_at: Date | null; cancelled_by: string | null;
  cancel_reason: string | null; created_at: Date;
};

export function toRules(s: ServiceRow): ServiceRules {
  return {
    id: s.id,
    durationMinutes: s.duration_minutes,
    bufferBeforeMinutes: s.buffer_before_minutes,
    bufferAfterMinutes: s.buffer_after_minutes,
    slotIntervalMinutes: s.slot_interval_minutes,
    minNoticeMinutes: s.min_notice_minutes,
    maxAdvanceDays: s.max_advance_days,
    capacity: s.capacity,
  };
}

export const bookingRepo = {
  serviceBySlug: (slug: string, t: Db = db) =>
    t.one<ServiceRow>("select * from services where slug = $1", [slug]),

  serviceById: (id: string, t: Db = db) => t.one<ServiceRow>("select * from services where id = $1", [id]),

  async weeklyRules(serviceId: string, t: Db = db): Promise<WeeklyRule[]> {
    const own = await t.query<{ weekday: number; start_time: string; end_time: string }>(
      "select weekday, start_time::text, end_time::text from availability_rules where service_id = $1",
      [serviceId],
    );
    const rows = own.length
      ? own
      : await t.query<{ weekday: number; start_time: string; end_time: string }>(
          "select weekday, start_time::text, end_time::text from availability_rules where service_id is null",
        );
    return rows.map((r) => ({ weekday: r.weekday, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));
  },

  async exceptions(serviceId: string, from: Date, to: Date, t: Db = db): Promise<Exception[]> {
    const rows = await t.query<{ kind: Exception["kind"]; starts_at: Date; ends_at: Date }>(
      `select kind, starts_at, ends_at from availability_exceptions
        where (service_id is null or service_id = $1) and tstzrange(starts_at, ends_at) && tstzrange($2, $3)`,
      [serviceId, from, to],
    );
    return rows.map((r) => ({ kind: r.kind, start: r.starts_at, end: r.ends_at }));
  },

  /** Everything that occupies the owner's time: active appointments + published event sessions. */
  async busy(from: Date, to: Date, t: Db = db): Promise<Busy[]> {
    const appts = await t.query<{ lower: Date; upper: Date; slot_group: string; service_id: string }>(
      `select lower(block_range) as lower, upper(block_range) as upper, slot_group, service_id from appointments
        where block_range && tstzrange($1, $2)
          and (status = 'confirmed' or (status = 'pending_payment' and hold_expires_at > now()))`,
      [from, to],
    );
    const events = await t.query<{ starts_at: Date; ends_at: Date; id: string }>(
      `select coalesce(s.starts_at, e.starts_at) as starts_at, coalesce(s.ends_at, e.ends_at) as ends_at, e.id
         from events e left join event_sessions s on s.event_id = e.id
        where e.status = 'published' and tstzrange(coalesce(s.starts_at, e.starts_at), coalesce(s.ends_at, e.ends_at)) && tstzrange($1, $2)`,
      [from, to],
    );
    return [
      ...appts.map((a) => ({ start: a.lower, end: a.upper, slotGroup: a.slot_group, serviceId: a.service_id })),
      ...events.map((e) => ({ start: e.starts_at, end: e.ends_at, slotGroup: `event:${e.id}`, serviceId: null })),
    ];
  },

  /** Marks expired holds so they stop blocking the exclusion constraint. */
  expireStaleHolds: (t: Db = db) =>
    t.query(`update appointments set status = 'expired' where status = 'pending_payment' and hold_expires_at < now() returning id`),
};
