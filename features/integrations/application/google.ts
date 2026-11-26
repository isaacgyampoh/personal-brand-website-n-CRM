import "server-only";
import { randomUUID } from "node:crypto";
import { db, tx } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { signValue, verifySignedValue } from "@/lib/security/crypto";
import { getIntegration, recordTestResult, storeOAuthSecret } from "@/lib/integrations/store";

/**
 * Google Calendar + Google Meet (OAuth 2.0 web flow, offline access).
 *  - Client ID/secret are entered in the Integration Centre; the refresh token
 *    produced by "Connect Google" is stored encrypted beside them.
 *  - Busy times from the selected calendar feed slot availability (advisory —
 *    the database exclusion constraint stays authoritative for our bookings).
 *  - Our own events are tagged (extendedProperties.private.bpApp) so they are
 *    never re-imported as external busy time.
 * Status: implemented against the Google OAuth 2.0 and Calendar v3 REST APIs;
 * UNVERIFIED until a real Google Cloud OAuth client is configured.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");
const API = "https://www.googleapis.com/calendar/v3";
export const APP_TAG = "bpApp";
const redirectUri = () => `${env().APP_URL}/api/integrations/google/callback`;

export class GoogleError extends Error {}

async function cfg() {
  const c = await getIntegration("google");
  return { ...c, refreshToken: c.all.refreshToken ?? "", calendarId: c.values.calendarId || "primary" };
}

export async function googleConnected(): Promise<boolean> {
  const c = await cfg();
  return c.enabled && Boolean(c.values.clientId && c.values.clientSecret && c.refreshToken);
}

export async function googleConnectUrl(userId: string): Promise<string> {
  const c = await cfg();
  if (!c.values.clientId || !c.values.clientSecret) throw new GoogleError("Save the Google OAuth client ID and secret first.");
  const state = signValue(`gcal:${userId}`, Math.floor(Date.now() / 1000) + 600);
  const p = new URLSearchParams({
    client_id: c.values.clientId, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function completeGoogleConnect(code: string, state: string, actorId: string): Promise<void> {
  const v = verifySignedValue(state);
  if (v !== `gcal:${actorId}`) throw new GoogleError("Invalid or expired OAuth state.");
  const c = await cfg();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.values.clientId, client_secret: c.values.clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string };
  if (!res.ok || !body.refresh_token) throw new GoogleError(`Google token exchange failed: ${body.error ?? res.status}`);
  await storeOAuthSecret("google", "refreshToken", body.refresh_token, actorId);
  accessCache = undefined;
  await testGoogle(actorId);
}

export async function disconnectGoogle(actorId: string): Promise<void> {
  const c = await cfg();
  if (c.refreshToken) {
    // Best effort revoke; the local token is removed regardless.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  }
  await storeOAuthSecret("google", "refreshToken", "", actorId);
  await recordTestResult("google", false, "Disconnected", actorId);
  await db.query("delete from external_busy where source = 'google'");
  accessCache = undefined;
}

let accessCache: { token: string; exp: number; key: string } | undefined;

async function accessToken(): Promise<string> {
  const c = await cfg();
  if (!c.values.clientId || !c.values.clientSecret || !c.refreshToken) throw new GoogleError("Google is not connected.");
  const key = `${c.values.clientId}:${c.refreshToken.slice(-8)}`;
  if (accessCache && accessCache.key === key && accessCache.exp > Date.now() + 60_000) return accessCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.values.clientId, client_secret: c.values.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    if (body.error === "invalid_grant") await recordTestResult("google", false, "Google access was revoked or expired. Reconnect Google.", null);
    throw new GoogleError(`Google token refresh failed: ${body.error ?? res.status}`);
  }
  accessCache = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000, key };
  return body.access_token;
}

async function gapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    const err = new GoogleError(`Google Calendar ${init.method ?? "GET"} failed (${res.status}): ${body.error?.message ?? ""}`);
    (err as GoogleError & { status?: number }).status = res.status;
    throw err;
  }
  return body;
}

export async function listGoogleCalendars(): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const r = await gapi<{ items?: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>("/users/me/calendarList?minAccessRole=writer");
  return (r.items ?? []).map((c) => ({ id: c.id, summary: c.summary, primary: Boolean(c.primary) }));
}

/** Connection test: refresh token works and the selected calendar is writable. */
export async function testGoogle(actorId: string | null): Promise<string> {
  try {
    const c = await cfg();
    const cals = await listGoogleCalendars();
    const ok = c.calendarId === "primary" ? cals.some((x) => x.primary) : cals.some((x) => x.id === c.calendarId);
    if (!ok) throw new GoogleError("The selected calendar isn't writable by the connected Google account. Choose another calendar.");
    await recordTestResult("google", true, null, actorId);
    return `Connected — ${cals.length} writable calendar(s) found`;
  } catch (e) {
    await recordTestResult("google", false, (e as Error).message, actorId);
    throw e;
  }
}

/** Job: refreshes external busy periods for the next 60 days. No-op when not connected. */
export async function syncGoogleBusy(): Promise<number> {
  const c = await cfg();
  if (!(await googleConnected()) || c.values.syncBusy === "false") {
    await db.query("delete from external_busy where source = 'google'");
    return 0;
  }
  const from = new Date();
  const to = new Date(Date.now() + 60 * 86400_000);
  const busy: { start: string; end: string }[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const p = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", maxResults: "250", orderBy: "startTime" });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await gapi<{
      nextPageToken?: string;
      items?: { status?: string; transparency?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; extendedProperties?: { private?: Record<string, string> } }[];
    }>(`/calendars/${encodeURIComponent(c.calendarId)}/events?${p.toString()}`);
    for (const e of r.items ?? []) {
      if (e.status === "cancelled" || e.transparency === "transparent" || e.extendedProperties?.private?.[APP_TAG]) continue;
      const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
      const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null);
      if (start && end && new Date(end) > new Date(start)) busy.push({ start, end });
    }
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  await tx(async (t) => {
    await t.query("delete from external_busy where source = 'google'");
    for (const b of busy) await t.query("insert into external_busy (source, starts_at, ends_at) values ('google', $1, $2)", [b.start, b.end]);
  });
  return busy.length;
}

export type CalendarEventInput = {
  summary: string; description: string; start: Date; end: Date; attendeeEmail?: string | null;
  location?: string | null; withMeet?: boolean; ref: string;
};

/** Creates or updates our event in the selected calendar; returns the event id and Meet link (if requested). */
export async function upsertGoogleEvent(existingId: string | null, input: CalendarEventInput): Promise<{ id: string; meetUrl: string | null }> {
  const c = await cfg();
  const invite = c.values.sendInvites !== "false" && input.attendeeEmail;
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.start.toISOString() },
    end: { dateTime: input.end.toISOString() },
    location: input.location ?? undefined,
    attendees: invite ? [{ email: input.attendeeEmail }] : [],
    extendedProperties: { private: { [APP_TAG]: "1", ref: input.ref } },
  };
  if (input.withMeet) body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  const qs = new URLSearchParams({ sendUpdates: invite ? "all" : "none", ...(input.withMeet ? { conferenceDataVersion: "1" } : {}) });
  const base = `/calendars/${encodeURIComponent(c.calendarId)}/events`;
  let ev: { id: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
  try {
    ev = existingId
      ? await gapi(`${base}/${encodeURIComponent(existingId)}?${qs}`, { method: "PATCH", body: JSON.stringify(body) })
      : await gapi(`${base}?${qs}`, { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (existingId && (status === 404 || status === 410)) return upsertGoogleEvent(null, input);
    throw e;
  }
  const meetUrl = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return { id: ev.id, meetUrl };
}

export async function deleteGoogleEvent(id: string, notify: boolean): Promise<void> {
  const c = await cfg();
  try {
    await gapi(`/calendars/${encodeURIComponent(c.calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=${notify ? "all" : "none"}`, { method: "DELETE" });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404 && status !== 410) throw e;
  }
}
