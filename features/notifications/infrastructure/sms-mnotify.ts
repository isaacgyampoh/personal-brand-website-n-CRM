import "server-only";
import { getIntegration } from "@/lib/integrations/store";

/**
 * mNotify SMS adapter (optional). Uses the documented "quick SMS" endpoint.
 * Status: UNVERIFIED — requires an mNotify API key and an approved sender ID.
 * A successful response means mNotify accepted the message, not that it was
 * delivered to the handset.
 */
const BASE = "https://api.mnotify.com/api";

export async function smsAvailable(): Promise<boolean> {
  return (await getIntegration("mnotify")).usable;
}

export async function sendSms(to: string, message: string): Promise<{ provider: string; messageId: string | null }> {
  const cfg = await getIntegration("mnotify");
  if (!cfg.usable) throw new Error("SMS is not configured. Set up mNotify in Settings → Integrations.");
  const res = await fetch(`${BASE}/sms/quick?key=${encodeURIComponent(cfg.values.apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ recipient: [to], sender: cfg.values.senderId, message: message.slice(0, 459), is_schedule: false }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; code?: string; summary?: { _id?: string }; message?: string };
  if (!res.ok || body.status !== "success") {
    throw new Error(`mNotify rejected SMS: ${body.message ?? res.status}`);
  }
  return { provider: "mnotify", messageId: body.summary?._id ?? null };
}

/** Connection test: reads the SMS balance (no message is sent). */
export async function testMnotify(apiKey: string): Promise<string> {
  const res = await fetch(`${BASE}/balance/sms?key=${encodeURIComponent(apiKey)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as { status?: string; balance?: number | string; message?: string };
  if (!res.ok || body.status !== "success") throw new Error(`mNotify rejected the API key: ${body.message ?? res.status}`);
  return `mNotify API key accepted (SMS balance: ${body.balance ?? "unknown"})`;
}
