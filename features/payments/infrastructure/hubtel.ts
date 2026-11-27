import "server-only";
import type { PaymentGateway, VerifiedTransaction, WebhookEvent } from "../domain/gateway";

/**
 * Hubtel Online Checkout adapter (optional secondary provider).
 *
 * Based on Hubtel's publicly described Online Checkout flow:
 *  - POST {initiateUrl} with HTTP Basic auth (API ID : API key) and
 *    totalAmount (decimal cedis), description, callbackUrl, returnUrl,
 *    cancellationUrl, merchantAccountNumber, clientReference → checkoutUrl.
 *  - Hubtel POSTs the outcome to callbackUrl. Callbacks are NOT signed, so they
 *    are only a trigger: every payment is confirmed by the server-side
 *    Transaction Status Check (which requires the server IP to be whitelisted).
 *
 * Endpoint URLs are configurable in the Integration Centre. Field names,
 * limits and status values were checked against Hubtel's Online Checkout
 * documentation (developers.hubtel.com, Nov 2026). STATUS: not yet verified
 * with a real merchant account — keep disabled until a small real payment
 * and status check succeed. Hubtel may additionally restrict callbacks to
 * its documented callback IP; no refund API is documented for checkout.
 */
export type HubtelConfig = { apiId: string; apiKey: string; merchantAccountNumber: string; initiateUrl: string; statusUrl: string };

const pick = (o: Record<string, unknown> | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit) return o[hit];
  }
  return undefined;
};

export function createHubtelGateway(cfg: HubtelConfig, fetchImpl: typeof fetch = fetch): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${cfg.apiId}:${cfg.apiKey}`).toString("base64")}`;
  const statusBase = cfg.statusUrl.replace("{merchantAccountNumber}", encodeURIComponent(cfg.merchantAccountNumber));

  async function request(url: string, init: RequestInit = {}) {
    const res = await fetchImpl(url, {
      ...init,
      headers: { authorization: auth, accept: "application/json", "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text); } catch { /* non-JSON error page */ }
    if (res.status === 403) throw new Error("Hubtel refused the request (403). For status checks, ask Hubtel to whitelist this server's public IP address.");
    if (res.status === 401) throw new Error("Hubtel rejected the API ID / API key (401).");
    if (!res.ok) throw new Error(`Hubtel request failed (${res.status}): ${String(pick(body, "message") ?? text.slice(0, 120))}`);
    return body;
  }

  return {
    name: "hubtel",
    mode: "live",
    supportsRefunds: false,

    async initialize({ reference, amountMinor, currency, email, callbackUrl, returnUrl, cancelUrl, description, metadata }) {
      if (currency.toUpperCase() !== "GHS") throw new Error("Hubtel checkout supports GHS only.");
      if (reference.length > 32) throw new Error("Hubtel client references are limited to 32 characters.");
      const body = await request(cfg.initiateUrl, {
        method: "POST",
        body: JSON.stringify({
          totalAmount: Number((amountMinor / 100).toFixed(2)),
          // Hubtel rejects special characters in the description.
          description: (description.replace(/[^A-Za-z0-9 .,()-]/g, " ").replace(/\s+/g, " ").trim() || "Order").slice(0, 120),
          callbackUrl, returnUrl, cancellationUrl: cancelUrl,
          merchantAccountNumber: cfg.merchantAccountNumber,
          clientReference: reference,
          ...(email ? { payeeEmail: email } : {}),
          ...(typeof metadata.customer_name === "string" && metadata.customer_name ? { payeeName: metadata.customer_name } : {}),
        }),
      });
      const data = pick(body, "data") as Record<string, unknown> | undefined;
      const url = pick(data, "checkoutUrl", "checkoutDirectUrl");
      if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error(`Hubtel did not return a checkout URL (${String(pick(body, "responseCode", "status") ?? "no code")}).`);
      return { authorizationUrl: url, accessCode: (pick(data, "checkoutId") as string) ?? null };
    },

    async verify(reference): Promise<VerifiedTransaction> {
      const body = await request(`${statusBase}?clientReference=${encodeURIComponent(reference)}`);
      const d = (pick(body, "data") as Record<string, unknown>) ?? {};
      const status = String(pick(d, "status") ?? "").toLowerCase();
      const amount = Number(pick(d, "amount") ?? 0);
      return {
        reference: String(pick(d, "clientReference") ?? reference),
        status: status === "paid" ? "success" : status === "unpaid" ? "pending" : status === "refunded" ? "reversed" : status === "failed" ? "failed" : "unknown",
        amountMinor: Math.round(amount * 100),
        currency: String(pick(d, "currencyCode", "currency") ?? "GHS").toUpperCase(),
        channel: (pick(d, "paymentMethod") as string) ?? null,
        providerTransactionId: (pick(d, "transactionId") as string) ?? null,
        gatewayResponse: (pick(body, "message") as string) ?? null,
        paidAt: pick(d, "date") ? new Date(String(pick(d, "date"))) : null,
      };
    },

    // Hubtel does not sign callbacks; the route authenticates its own signed callback token instead.
    verifyWebhookSignature() {
      return false;
    },

    parseWebhook(rawBody): WebhookEvent {
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      const d = (pick(body, "Data") as Record<string, unknown>) ?? {};
      const reference = (pick(d, "ClientReference") as string) ?? null;
      const checkoutId = String(pick(d, "CheckoutId", "SalesInvoiceId") ?? reference ?? "none");
      return { eventKey: `callback:${checkoutId}:${String(pick(d, "Status") ?? pick(body, "Status") ?? "")}`, type: "checkout.callback", reference, refundId: null, payload: body };
    },

    async refund() {
      throw new Error("Hubtel refunds are processed in the Hubtel merchant dashboard.");
    },
    async fetchRefund() {
      return { status: "pending", raw: null };
    },

    async testConnection() {
      // Status check for a reference that cannot exist: a 4xx "not found" style answer proves the
      // credentials and IP whitelist are accepted; 401/403 prove they are not.
      const res = await fetchImpl(`${statusBase}?clientReference=connection-test-${Date.now()}`, {
        headers: { authorization: auth, accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 401) throw new Error("Hubtel rejected the API ID / API key (401).");
      if (res.status === 403) throw new Error("Hubtel refused access (403) — the server's IP address must be whitelisted by Hubtel.");
      if (res.status >= 500) throw new Error(`Hubtel status service error (${res.status}).`);
      return `Hubtel status API reachable and credentials accepted (HTTP ${res.status})`;
    },
  };
}
