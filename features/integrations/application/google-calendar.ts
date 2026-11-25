import "server-only";
import { db } from "@/lib/database/pool";
import { env, integrations } from "@/lib/config/env";
import { decrypt, encrypt, signValue, verifySignedValue } from "@/lib/security/crypto";

/**
 * Google Calendar sync for appointments (OAuth 2.0, offline access).
 * Status: implemented against Google OAuth / Calendar v3 REST APIs.
 * UNVERIFIED until GOOGLE_CLIENT_ID/SECRET are configured and the owner
 * connects a calendar in Admin → Settings → Integrations.
 */
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const redirectUri = () => `${env().APP_URL}/api/integrations/google/callback`;

export function googleConnectUrl(userId: string): string {
  if (!integrations().googleCalendar) throw new Error("Google OAuth client is not configured.");
  const state = signValue(`gcal:${userId}`, Math.floor(Date.now() / 1000) + 600);
  const p = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function completeGoogleConnect(code: string, state: string): Promise<void> {
  const v = verifySignedValue(state);
  if (!v?.startsWith("gcal:")) throw new Error("Invalid or expired OAuth state.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env().GOOGLE_CLIENT_ID!, client_secret: env().GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const body = (await res.json()) as { refresh_token?: string; error?: string };
  if (!res.ok || !body.refresh_token) throw new Error(`Google token exchange failed: ${body.error ?? res.status}`);
  await db.query(
    `insert into integrations (provider, status, credentials_encrypted, metadata) values ('google_calendar','connected',$1,$2)
     on conflict (provider) do update set status = 'connected', credentials_encrypted = excluded.credentials_encrypted, metadata = excluded.metadata`,
    [encrypt(JSON.stringify({ refresh_token: body.refresh_token })), JSON.stringify({ connectedAt: new Date().toISOString(), calendarId: "primary" })],
  );
}

async function accessToken(): Promise<string | null> {
  if (!integrations().googleCalendar) return null;
  const row = await db.one<{ credentials_encrypted: string | null; status: string }>("select credentials_encrypted, status from integrations where provider = 'google_calendar'");
  if (!row?.credentials_encrypted || row.status !== "connected") return null;
  const { refresh_token } = JSON.parse(decrypt(row.credentials_encrypted)) as { refresh_token: string };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env().GOOGLE_CLIENT_ID!, client_secret: env().GOOGLE_CLIENT_SECRET!, refresh_token, grant_type: "refresh_token" }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    if (body.error === "invalid_grant") await db.query("update integrations set status = 'error' where provider = 'google_calendar'");
    throw new Error(`Google token refresh failed: ${body.error ?? res.status}`);
  }
  return body.access_token;
}

/** Job handler: mirrors an appointment into the connected Google Calendar. No-op when not connected. */
export async function syncAppointmentToCalendar(appointmentId: string): Promise<void> {
  const token = await accessToken();
  if (!token) return;
  const a = await db.one<{ id: string; status: string; starts_at: Date; ends_at: Date; calendar_event_id: string | null; reference: string; service: string; full_name: string; email: string }>(
    `select a.id, a.status, a.starts_at, a.ends_at, a.calendar_event_id, a.reference, s.name as service, c.full_name, c.email
       from appointments a join services s on s.id = a.service_id join contacts c on c.id = a.contact_id where a.id = $1`,
    [appointmentId],
  );
  if (!a) return;
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  if (a.status !== "confirmed") {
    if (a.calendar_event_id) {
      const res = await fetch(`${base}/${encodeURIComponent(a.calendar_event_id)}`, { method: "DELETE", headers });
      if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Calendar delete failed: ${res.status}`);
      await db.query("update appointments set calendar_event_id = null where id = $1", [a.id]);
    }
    return;
  }
  const event = {
    summary: `${a.service} — ${a.full_name || a.email}`,
    description: `Booking ${a.reference}\n${env().APP_URL}/admin/bookings/${a.id}`,
    start: { dateTime: a.starts_at.toISOString() },
    end: { dateTime: a.ends_at.toISOString() },
  };
  const res = await fetch(a.calendar_event_id ? `${base}/${encodeURIComponent(a.calendar_event_id)}` : base, {
    method: a.calendar_event_id ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Calendar sync failed: ${res.status}`);
  const body = (await res.json()) as { id: string };
  await db.query("update appointments set calendar_event_id = $2 where id = $1", [a.id, body.id]);
}
