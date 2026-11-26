import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentGateway, VerifiedTransaction, WebhookEvent } from "../domain/gateway";

/**
 * Paystack adapter (https://paystack.com/docs/api/).
 *  - Amounts are sent in the currency subunit (pesewas for GHS).
 *  - Webhooks are authenticated with HMAC-SHA512 of the raw body using the
 *    secret key (header `x-paystack-signature`).
 *  - Success is only ever accepted after GET /transaction/verify/:reference.
 */
export function createPaystackGateway(secretKey: string, fetchImpl: typeof fetch = fetch, opts: { channels?: string[] } = {}): PaymentGateway {
  const base = "https://api.paystack.co";
  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
    if (!res.ok || !body?.status) {
      throw new Error(`Paystack ${path.split("?")[0]} failed (${res.status}): ${body?.message ?? "no response"}`);
    }
    return body.data as T;
  }

  return {
    name: "paystack",
    mode,
    supportsRefunds: true,

    async initialize({ reference, amountMinor, currency, email, callbackUrl, metadata }) {
      const data = await call<{ authorization_url: string; access_code: string }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({ reference, amount: amountMinor, currency, email, callback_url: callbackUrl, metadata, ...(opts.channels?.length ? { channels: opts.channels } : {}) }),
      });
      return { authorizationUrl: data.authorization_url, accessCode: data.access_code ?? null };
    },

    async verify(reference): Promise<VerifiedTransaction> {
      const d = await call<{
        status: string; amount: number; currency: string; reference: string; id: number;
        channel?: string; gateway_response?: string; paid_at?: string | null;
      }>(`/transaction/verify/${encodeURIComponent(reference)}`);
      const known = ["success", "failed", "abandoned", "pending", "reversed"];
      return {
        reference: d.reference,
        status: (known.includes(d.status) ? d.status : d.status === "ongoing" || d.status === "processing" || d.status === "queued" ? "pending" : "unknown") as VerifiedTransaction["status"],
        amountMinor: Number(d.amount),
        currency: String(d.currency).toUpperCase(),
        channel: d.channel ?? null,
        providerTransactionId: d.id ? String(d.id) : null,
        gatewayResponse: d.gateway_response ?? null,
        paidAt: d.paid_at ? new Date(d.paid_at) : null,
      };
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
      const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
      return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
    },

    parseWebhook(rawBody): WebhookEvent {
      const body = JSON.parse(rawBody) as {
        event?: string;
        data?: { id?: number | string; reference?: string; transaction_reference?: string; transaction?: { reference?: string }; status?: string };
      };
      const type = String(body.event ?? "unknown");
      const d = body.data ?? {};
      const reference = d.reference ?? d.transaction_reference ?? d.transaction?.reference ?? null;
      const isRefund = type.startsWith("refund.");
      return {
        eventKey: `${type}:${d.id ?? reference ?? "none"}:${d.status ?? ""}`,
        type,
        reference: isRefund ? (d.transaction_reference ?? d.transaction?.reference ?? null) : reference,
        refundId: isRefund && d.id != null ? String(d.id) : null,
        payload: body,
      };
    },

    async refund({ reference, amountMinor, note }) {
      const d = await call<{ id: number; status: string }>("/refund", {
        method: "POST",
        body: JSON.stringify({ transaction: reference, amount: amountMinor, merchant_note: note.slice(0, 200) }),
      });
      return { providerRefundId: String(d.id), status: d.status };
    },

    async testConnection() {
      // Lists one transaction: succeeds only with a valid secret key, has no side effects.
      await call<unknown>("/transaction?perPage=1");
      return `Paystack ${mode} key accepted`;
    },

    async fetchRefund(id) {
      const d = await call<{ status: string }>(`/refund/${encodeURIComponent(id)}`);
      const s = d.status;
      const status = s === "processed" ? "processed" : s === "failed" ? "failed" : s === "processing" ? "processing" : "pending";
      return { status, raw: d };
    },
  };
}
