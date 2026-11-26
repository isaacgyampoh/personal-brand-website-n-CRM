import "server-only";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { loadSetting } from "@/features/settings/application/settings";
import { alertAdmin } from "@/features/notifications/application/send";
import { deleteGoogleEvent, googleConnected, upsertGoogleEvent } from "./google";
import { deleteZoomMeeting, upsertZoomMeeting, zoomAvailable } from "./zoom";

/**
 * Keeps provider meetings and calendar entries in step with bookings and
 * events. Rules:
 *  - A meeting link an admin typed in (manual) is never overwritten.
 *  - Zoom / Google Meet meetings are created when the booking is confirmed,
 *    updated on reschedule and deleted on cancellation.
 *  - If the chosen provider is not connected, the service's default link (if
 *    any) is the fallback and the owner gets a task to add a link manually.
 *  - Links are only shown to confirmed participants (portal/manage pages gate
 *    on status; event links open only inside the access window).
 */
type ApptRow = {
  id: string; status: string; starts_at: Date; ends_at: Date; reference: string; calendar_event_id: string | null;
  meeting_url: string | null; meeting_provider: string | null; meeting_external_id: string | null; customer_timezone: string;
  service: string; service_provider: string; location_type: string; location_details: string; default_meeting_url: string | null;
  full_name: string; email: string;
};

export async function syncAppointment(appointmentId: string): Promise<void> {
  const a = await db.one<ApptRow>(
    `select a.id, a.status, a.starts_at, a.ends_at, a.reference, a.calendar_event_id, a.meeting_url, a.meeting_provider, a.meeting_external_id,
            a.customer_timezone, s.name as service, s.meeting_provider as service_provider, s.location_type, s.location_details,
            s.default_meeting_url, c.full_name, c.email
       from appointments a join services s on s.id = a.service_id join contacts c on c.id = a.contact_id where a.id = $1`,
    [appointmentId],
  );
  if (!a) return;
  const google = await googleConnected();
  const active = a.status === "confirmed";

  // ---- Zoom ----------------------------------------------------------------
  if (a.meeting_provider === "zoom" && a.meeting_external_id && !active) {
    await deleteZoomMeeting(a.meeting_external_id);
    await db.query("update appointments set meeting_external_id = null, meeting_url = null where id = $1", [a.id]);
  }
  const wantsZoom = active && a.location_type === "online" && a.service_provider === "zoom" && a.meeting_provider !== "manual";
  if (wantsZoom) {
    if (await zoomAvailable()) {
      const tz = (await loadSetting("business")).timezone;
      const m = await upsertZoomMeeting(a.meeting_external_id, {
        topic: `${a.service} — ${a.full_name || a.email}`, start: a.starts_at,
        minutes: (a.ends_at.getTime() - a.starts_at.getTime()) / 60_000, timezone: tz, agenda: `Booking ${a.reference}`,
      });
      await db.query("update appointments set meeting_provider = 'zoom', meeting_external_id = $2, meeting_url = $3 where id = $1", [a.id, m.id, m.joinUrl]);
      a.meeting_url = m.joinUrl;
    } else if (!a.meeting_url) {
      await alertAdmin(`Add a meeting link for ${a.reference}`, "Zoom isn't connected, so no meeting was created. Add a link on the booking or connect Zoom in Settings → Integrations.", `meeting-missing:${a.id}`);
    }
  }

  // ---- Google Calendar (+ Meet) -------------------------------------------
  const wantsMeet = active && a.location_type === "online" && a.service_provider === "google_meet" && a.meeting_provider !== "manual";
  if (!google) {
    if (wantsMeet && !a.meeting_url) {
      await alertAdmin(`Add a meeting link for ${a.reference}`, "Google isn't connected, so no Meet link was created. Add a link on the booking or connect Google in Settings → Integrations.", `meeting-missing:${a.id}`);
    }
    return;
  }
  if (!active) {
    if (a.calendar_event_id) {
      await deleteGoogleEvent(a.calendar_event_id, a.status === "cancelled");
      await db.query("update appointments set calendar_event_id = null where id = $1", [a.id]);
      if (a.meeting_provider === "google_meet") await db.query("update appointments set meeting_url = null, meeting_external_id = null where id = $1", [a.id]);
    }
    return;
  }
  const location = a.location_type === "in_person" ? a.location_details : a.location_type === "phone" ? "Phone call" : a.meeting_url ?? undefined;
  const ev = await upsertGoogleEvent(a.calendar_event_id, {
    summary: `${a.service} — ${a.full_name || a.email}`,
    description: `Booking ${a.reference}\nManage: ${env().APP_URL}/portal/appointments`,
    start: a.starts_at, end: a.ends_at, attendeeEmail: a.email, location, ref: `appt:${a.id}`,
    withMeet: wantsMeet && !a.meeting_url,
  });
  await db.query("update appointments set calendar_event_id = $2 where id = $1", [a.id, ev.id]);
  if (wantsMeet && ev.meetUrl) {
    await db.query("update appointments set meeting_provider = 'google_meet', meeting_external_id = $2, meeting_url = $3 where id = $1 and (meeting_provider is distinct from 'manual')", [a.id, ev.id, ev.meetUrl]);
  }
}

/** Creates/updates/deletes the provider meeting for an event (masterclass/webinar). */
export async function syncEventMeeting(eventId: string): Promise<{ url: string | null }> {
  const e = await db.one<{ id: string; title: string; status: string; starts_at: Date; ends_at: Date; timezone: string; slug: string; format: string }>(
    "select id, title, status, starts_at, ends_at, timezone, slug, format from events where id = $1", [eventId],
  );
  const acc = await db.one<{ meeting_provider: string; meeting_url: string | null; meeting_external_id: string | null; calendar_event_id: string | null }>(
    "select meeting_provider, meeting_url, meeting_external_id, calendar_event_id from event_access where event_id = $1", [eventId],
  );
  if (!e || !acc) return { url: null };
  const ended = e.status === "cancelled" || e.status === "draft";

  if (acc.meeting_provider === "zoom") {
    if (ended) {
      if (acc.meeting_external_id) await deleteZoomMeeting(acc.meeting_external_id);
      await db.query("update event_access set meeting_external_id = null where event_id = $1", [eventId]);
      return { url: null };
    }
    const m = await upsertZoomMeeting(acc.meeting_external_id, {
      topic: e.title, start: e.starts_at, minutes: (e.ends_at.getTime() - e.starts_at.getTime()) / 60_000, timezone: e.timezone,
      agenda: `${env().APP_URL}/masterclasses/${e.slug}`,
    });
    await db.query("update event_access set meeting_external_id = $2, meeting_url = $3, meeting_id = $2, passcode = $4, updated_at = now() where event_id = $1", [eventId, m.id, m.joinUrl, m.passcode]);
    return { url: m.joinUrl };
  }
  if (acc.meeting_provider === "google_meet") {
    if (ended) {
      if (acc.calendar_event_id) await deleteGoogleEvent(acc.calendar_event_id, false);
      await db.query("update event_access set calendar_event_id = null, meeting_external_id = null where event_id = $1", [eventId]);
      return { url: null };
    }
    // Attendees are NOT added as guests: the link is released only to confirmed registrants inside the portal.
    const ev = await upsertGoogleEvent(acc.calendar_event_id, {
      summary: e.title, description: `${env().APP_URL}/masterclasses/${e.slug}`, start: e.starts_at, end: e.ends_at, ref: `event:${e.id}`, withMeet: !acc.meeting_url,
    });
    await db.query("update event_access set calendar_event_id = $2, meeting_external_id = $2, meeting_url = coalesce($3, meeting_url), updated_at = now() where event_id = $1", [eventId, ev.id, ev.meetUrl]);
    return { url: ev.meetUrl ?? acc.meeting_url };
  }
  return { url: acc.meeting_url };
}
