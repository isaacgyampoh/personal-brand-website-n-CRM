import { db } from "@/lib/database/pool";
import { verifySignedValue } from "@/lib/security/crypto";
import { buildIcs } from "@/lib/ics";
import { env } from "@/lib/config/env";

/** Calendar file for a confirmed appointment or event (signed, non-guessable link). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = verifySignedValue((await params).token);
  if (!v) return new Response("Link expired", { status: 404 });
  const [kind, id] = v.split(":");
  const host = new URL(env().APP_URL).hostname;
  let ics: string | null = null;
  if (kind === "appointment") {
    const a = await db.one<{ id: string; starts_at: Date; ends_at: Date; status: string; reschedule_count: number; name: string; location_type: string }>(
      `select a.id, a.starts_at, a.ends_at, a.status, a.reschedule_count, s.name, s.location_type from appointments a join services s on s.id = a.service_id where a.id = $1`,
      [id],
    );
    if (a) ics = buildIcs({ uid: `appt-${a.id}@${host}`, title: a.name, start: a.starts_at, end: a.ends_at, sequence: a.reschedule_count, cancelled: a.status === "cancelled", location: a.location_type === "online" ? "Online" : undefined, url: `${env().APP_URL}/portal/appointments` });
  } else if (kind === "event") {
    const e = await db.one<{ id: string; title: string; starts_at: Date; ends_at: Date; status: string; format: string; venue_name: string }>(
      "select id, title, starts_at, ends_at, status, format, venue_name from events where id = $1",
      [id],
    );
    // Joining links are deliberately NOT included; attendees open their portal page.
    if (e) ics = buildIcs({ uid: `event-${e.id}@${host}`, title: e.title, start: e.starts_at, end: e.ends_at, cancelled: e.status === "cancelled", location: e.format === "online" ? "Online — join from your portal" : e.venue_name, url: `${env().APP_URL}/portal/events/${e.id}` });
  }
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="invite.ics"', "cache-control": "private, no-store" } });
}
