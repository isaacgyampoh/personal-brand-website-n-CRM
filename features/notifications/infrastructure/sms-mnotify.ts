import "server-only";
import { env, integrations } from "@/lib/config/env";

/**
 * mNotify SMS adapter (optional). Uses the documented "quick SMS" endpoint.
 * Status: UNVERIFIED — requires an mNotify API key and an approved sender ID.
 * A successful response means mNotify accepted the message, not that it was
 * delivered to the handset.
 */
export async function sendSms(to: string, message: string): Promise<{ provider: string; messageId: string | null }> {
  if (!integrations().sms) throw new Error("SMS is not configured (MNOTIFY_API_KEY / MNOTIFY_SENDER_ID).");
  const e = env();
  const res = await fetch(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(e.MNOTIFY_API_KEY!)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ recipient: [to], sender: e.MNOTIFY_SENDER_ID, message: message.slice(0, 459), is_schedule: false }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; code?: string; summary?: { _id?: string }; message?: string };
  if (!res.ok || body.status !== "success") {
    throw new Error(`mNotify rejected SMS: ${body.message ?? res.status}`);
  }
  return { provider: "mnotify", messageId: body.summary?._id ?? null };
}
