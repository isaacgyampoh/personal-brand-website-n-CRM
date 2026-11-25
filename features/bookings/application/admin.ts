import "server-only";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { UserError } from "@/lib/errors";
import { isRichDoc, docFromText } from "@/features/content/domain/rich-text";
import { parseMajorToMinor } from "@/lib/money";

export class ServiceAdminError extends UserError {}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const serviceInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  slug: z.string().trim().max(100).default(""),
  category: z.string().trim().max(60).default("coaching"),
  summary: z.string().trim().max(500).default(""),
  description: z.string().max(20000).default(""),
  imageMediaId: z.union([z.literal(""), z.string().uuid()]).default(""),
  price: z.string().trim().default("0"),
  currency: z.string().length(3).default("GHS"),
  priceDisplay: z.string().trim().max(80).default(""),
  durationMinutes: int(10, 600),
  bufferBeforeMinutes: int(0, 240).default(0),
  bufferAfterMinutes: int(0, 240).default(15),
  slotIntervalMinutes: int(5, 240).default(30),
  minNoticeHours: z.coerce.number().min(0).max(720).default(12),
  maxAdvanceDays: int(1, 365).default(60),
  capacity: int(1, 500).default(1),
  bookingMode: z.enum(["instant", "enquiry", "none"]).default("instant"),
  locationType: z.enum(["online", "in_person", "phone"]).default("online"),
  locationDetails: z.string().trim().max(300).default(""),
  meetingProvider: z.enum(["manual", "zoom", "google_meet"]).default("manual"),
  defaultMeetingUrl: z.union([z.literal(""), z.string().trim().url().startsWith("https://")]).default(""),
  cancelCutoffHours: int(0, 720).default(24),
  rescheduleCutoffHours: int(0, 720).default(24),
  maxReschedules: int(0, 10).default(2),
  refundOnCancel: z.boolean().default(true),
  cancellationPolicy: z.string().trim().max(1000).default(""),
  isActive: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: int(0, 1000).default(0),
});

export async function saveService(id: string | null, raw: unknown, actorId: string): Promise<string> {
  const i = serviceInput.parse(raw);
  const priceMinor = parseMajorToMinor(i.price || "0", i.currency);
  const slug = slugify(i.slug || i.name);
  const desc = (() => { try { const j = JSON.parse(i.description); return isRichDoc(j) ? j : docFromText(i.description); } catch { return docFromText(i.description); } })();
  const vals = [slug, i.name, i.category, i.summary, JSON.stringify(desc), i.imageMediaId || null, priceMinor, i.currency.toUpperCase(), i.priceDisplay,
    i.durationMinutes, i.bufferBeforeMinutes, i.bufferAfterMinutes, i.slotIntervalMinutes, Math.round(i.minNoticeHours * 60), i.maxAdvanceDays,
    i.capacity, i.bookingMode, i.locationType, i.locationDetails, i.meetingProvider, i.defaultMeetingUrl || null, i.cancelCutoffHours,
    i.rescheduleCutoffHours, i.maxReschedules, i.refundOnCancel, i.cancellationPolicy, i.isActive, i.featured, i.sortOrder];
  try {
    if (id) {
      await db.query(
        `update services set slug=$1,name=$2,category=$3,summary=$4,description=$5,image_media_id=$6,price_minor=$7,currency=$8,price_display=$9,
           duration_minutes=$10,buffer_before_minutes=$11,buffer_after_minutes=$12,slot_interval_minutes=$13,min_notice_minutes=$14,max_advance_days=$15,
           capacity=$16,booking_mode=$17,location_type=$18,location_details=$19,meeting_provider=$20,default_meeting_url=$21,cancel_cutoff_hours=$22,
           reschedule_cutoff_hours=$23,max_reschedules=$24,refund_on_cancel=$25,cancellation_policy=$26,is_active=$27,featured=$28,sort_order=$29
         where id=$30`,
        [...vals, id],
      );
    } else {
      const r = await db.one<{ id: string }>(
        `insert into services (slug,name,category,summary,description,image_media_id,price_minor,currency,price_display,duration_minutes,buffer_before_minutes,
           buffer_after_minutes,slot_interval_minutes,min_notice_minutes,max_advance_days,capacity,booking_mode,location_type,location_details,meeting_provider,
           default_meeting_url,cancel_cutoff_hours,reschedule_cutoff_hours,max_reschedules,refund_on_cancel,cancellation_policy,is_active,featured,sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) returning id`,
        vals,
      );
      id = r!.id;
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ServiceAdminError("Another service already uses that URL slug.");
    throw e;
  }
  await audit({ actorId, action: "service.save", entityType: "service", entityId: id, data: { priceMinor } });
  return id!;
}

// --------------- Availability ---------------
export const weeklyRuleRows = (serviceId: string | null) =>
  db.query<{ id: string; weekday: number; start_time: string; end_time: string }>(
    `select id, weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
       from availability_rules where service_id is not distinct from $1 order by weekday, start_time`,
    [serviceId],
  );

/** Replaces weekly hours for the business (serviceId null) or one service. */
export async function saveWeeklyHours(serviceId: string | null, rows: { weekday: number; start: string; end: string }[], actorId: string) {
  for (const r of rows) {
    if (!/^\d{2}:\d{2}$/.test(r.start) || !/^\d{2}:\d{2}$/.test(r.end) || r.end <= r.start) throw new ServiceAdminError(`Check the hours for ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.weekday]}.`);
  }
  await tx(async (t) => {
    await t.query("delete from availability_rules where service_id is not distinct from $1", [serviceId]);
    for (const r of rows) await t.query("insert into availability_rules (service_id, weekday, start_time, end_time) values ($1,$2,$3,$4)", [serviceId, r.weekday, r.start, r.end]);
    await audit({ actorId, action: "availability.hours", entityType: "availability", entityId: serviceId ?? "global", data: { rows } }, t);
  });
}

export async function addException(input: { serviceId: string | null; kind: "blocked" | "holiday" | "extra_hours"; startsAt: Date; endsAt: Date; reason: string }, actorId: string) {
  if (input.endsAt <= input.startsAt) throw new ServiceAdminError("End must be after start.");
  await db.query(
    "insert into availability_exceptions (service_id, kind, starts_at, ends_at, reason) values ($1,$2,$3,$4,$5)",
    [input.serviceId, input.kind, input.startsAt, input.endsAt, input.reason.slice(0, 200)],
  );
  await audit({ actorId, action: "availability.exception", entityType: "availability", data: input });
}

export const upcomingExceptions = () =>
  db.query<{ id: string; kind: string; starts_at: Date; ends_at: Date; reason: string; service: string | null }>(
    `select e.id, e.kind, e.starts_at, e.ends_at, e.reason, s.name as service from availability_exceptions e
       left join services s on s.id = e.service_id where e.ends_at > now() order by e.starts_at limit 100`,
  );

// --------------- Appointments ---------------
export async function listAppointments(opts: { from: Date; to: Date; status?: string; q?: string }) {
  const params: unknown[] = [opts.from, opts.to];
  const where = ["a.starts_at >= $1", "a.starts_at < $2"];
  if (opts.status) { params.push(opts.status); where.push(`a.status = $${params.length}`); }
  else where.push("a.status not in ('expired')");
  if (opts.q) { params.push(`%${opts.q}%`); where.push(`(c.full_name ilike $${params.length} or c.email::text ilike $${params.length} or a.reference ilike $${params.length})`); }
  return db.query<{ id: string; reference: string; starts_at: Date; ends_at: Date; status: string; service: string; name: string; email: string | null; order_status: string | null }>(
    `select a.id, a.reference, a.starts_at, a.ends_at, a.status, s.name as service, coalesce(nullif(c.full_name,''), c.email::text) as name, c.email,
            o.status as order_status
       from appointments a join services s on s.id = a.service_id join contacts c on c.id = a.contact_id left join orders o on o.id = a.order_id
      where ${where.join(" and ")} order by a.starts_at limit 500`,
    params,
  );
}

export async function appointmentDetail(id: string) {
  return db.one<{
    id: string; reference: string; starts_at: Date; ends_at: Date; status: string; service_id: string; service: string; contact_id: string;
    name: string; email: string | null; phone: string | null; customer_timezone: string; customer_notes: string; internal_notes: string;
    meeting_url: string | null; meeting_details: string; order_id: string | null; order_reference: string | null; order_status: string | null;
    total_minor: number | null; currency: string | null; reschedule_count: number; cancelled_by: string | null; cancel_reason: string | null; created_at: Date;
  }>(
    `select a.*, s.name as service, coalesce(nullif(c.full_name,''), c.email::text) as name, c.email, c.phone,
            o.reference as order_reference, o.status as order_status, o.total_minor, o.currency
       from appointments a join services s on s.id = a.service_id join contacts c on c.id = a.contact_id left join orders o on o.id = a.order_id
      where a.id = $1`,
    [id],
  );
}

export async function updateAppointmentAdmin(id: string, patch: { status?: "completed" | "no_show"; meetingUrl?: string; meetingDetails?: string; internalNotes?: string }, actorId: string) {
  await tx(async (t) => {
    const a = await t.one<{ status: string }>("select status from appointments where id = $1 for update", [id]);
    if (!a) throw new ServiceAdminError("Appointment not found.");
    if (patch.status && a.status !== "confirmed") throw new ServiceAdminError("Only confirmed appointments can be marked completed or no-show.");
    if (patch.meetingUrl && !/^https:\/\//.test(patch.meetingUrl)) throw new ServiceAdminError("Meeting link must start with https://");
    await t.query(
      `update appointments set status = coalesce($2, status), meeting_url = coalesce(nullif($3,''), meeting_url), meeting_details = coalesce($4, meeting_details),
         internal_notes = coalesce($5, internal_notes) where id = $1`,
      [id, patch.status ?? null, patch.meetingUrl ?? null, patch.meetingDetails ?? null, patch.internalNotes ?? null],
    );
    await audit({ actorId, action: "appointment.update", entityType: "appointment", entityId: id, data: patch }, t);
  });
}
