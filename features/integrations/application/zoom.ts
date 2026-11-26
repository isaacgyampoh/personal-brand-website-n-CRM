import "server-only";
import { getIntegration } from "@/lib/integrations/store";

/**
 * Zoom meetings via a Server-to-Server OAuth app (account credentials grant).
 * Status: implemented against Zoom's public REST API v2; UNVERIFIED until a
 * real Zoom S2S OAuth app (scopes meeting:write:admin / meeting:read:admin,
 * user:read:admin) is configured.
 */
const API = "https://api.zoom.us/v2";

export class ZoomError extends Error {}

export type ZoomCreds = { accountId: string; clientId: string; clientSecret: string; hostUser: string; waitingRoom: boolean };

async function creds(): Promise<ZoomCreds | null> {
  const c = await getIntegration("zoom");
  if (!c.usable) return null;
  return { accountId: c.values.accountId, clientId: c.values.clientId, clientSecret: c.values.clientSecret, hostUser: c.values.hostUser || "me", waitingRoom: c.values.waitingRoom !== "false" };
}

export async function zoomAvailable(): Promise<boolean> {
  return (await creds()) !== null;
}

let tokenCache: { key: string; token: string; exp: number } | undefined;

async function token(c: ZoomCreds): Promise<string> {
  const key = `${c.accountId}:${c.clientId}`;
  if (tokenCache?.key === key && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(c.accountId)}`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; reason?: string; error?: string };
  if (!res.ok || !body.access_token) throw new ZoomError(`Zoom rejected the app credentials: ${body.reason ?? body.error ?? res.status}`);
  tokenCache = { key, token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function zapi<T>(c: ZoomCreds, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await token(c)}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    const err = new ZoomError(`Zoom ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${body.message ?? ""}`);
    (err as ZoomError & { status?: number }).status = res.status;
    throw err;
  }
  return body;
}

/** Connection test using explicit credentials (from the form) or stored ones. */
export async function testZoom(c?: ZoomCreds): Promise<string> {
  const cc = c ?? (await creds());
  if (!cc) throw new ZoomError("Zoom is not configured.");
  const u = await zapi<{ email?: string; type?: number }>(cc, `/users/${encodeURIComponent(cc.hostUser)}`);
  return `Zoom app authorised; host ${u.email ?? cc.hostUser}`;
}

export type ZoomMeeting = { id: string; joinUrl: string; passcode: string | null };

export async function upsertZoomMeeting(existingId: string | null, input: { topic: string; start: Date; minutes: number; timezone: string; agenda?: string }): Promise<ZoomMeeting> {
  const c = await creds();
  if (!c) throw new ZoomError("Zoom is not configured.");
  const body = {
    topic: input.topic.slice(0, 200),
    type: 2,
    start_time: input.start.toISOString(),
    duration: Math.max(1, Math.round(input.minutes)),
    timezone: input.timezone,
    agenda: (input.agenda ?? "").slice(0, 2000),
    settings: { waiting_room: c.waitingRoom, join_before_host: false, approval_type: 2, meeting_authentication: false },
  };
  if (existingId) {
    try {
      await zapi(c, `/meetings/${encodeURIComponent(existingId)}`, { method: "PATCH", body: JSON.stringify(body) });
      const m = await zapi<{ id: number; join_url: string; password?: string }>(c, `/meetings/${encodeURIComponent(existingId)}`);
      return { id: String(m.id), joinUrl: m.join_url, passcode: m.password ?? null };
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  const m = await zapi<{ id: number; join_url: string; password?: string }>(c, `/users/${encodeURIComponent(c.hostUser)}/meetings`, { method: "POST", body: JSON.stringify(body) });
  return { id: String(m.id), joinUrl: m.join_url, passcode: m.password ?? null };
}

export async function deleteZoomMeeting(id: string): Promise<void> {
  const c = await creds();
  if (!c) return;
  try {
    await zapi(c, `/meetings/${encodeURIComponent(id)}?schedule_for_reminder=false`, { method: "DELETE" });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
}
