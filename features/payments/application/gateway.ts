import "server-only";
import { env } from "@/lib/config/env";
import { getIntegration } from "@/lib/integrations/store";
import { loadSetting } from "@/features/settings/application/settings";
import { createPaystackGateway } from "../infrastructure/paystack";
import { createHubtelGateway } from "../infrastructure/hubtel";
import type { PaymentGateway, ProviderName } from "../domain/gateway";

let override: PaymentGateway | null | undefined;

/** The provider new checkouts use (Business settings → Checkout). Historical payments keep their own provider. */
export async function activePaymentProvider(): Promise<ProviderName> {
  return (await loadSetting("commerce")).paymentProvider;
}

/**
 * Gateway for `provider` built from the encrypted Integration Centre config.
 *  - purpose "checkout": the integration must be enabled, complete and VERIFIED
 *    (a passing connection test), and live mode must be approved by the operator.
 *  - purpose "verify": used for webhooks, reconciliation and refunds of existing
 *    payments; works whenever credentials exist, even if since disabled.
 */
export async function paymentGateway(provider?: ProviderName, purpose: "checkout" | "verify" = "verify"): Promise<PaymentGateway | null> {
  if (override !== undefined) return override;
  const name = provider ?? (await activePaymentProvider());
  const cfg = await getIntegration(name);
  if (purpose === "checkout") {
    if (!cfg.usable || !cfg.verified) return null;
    if ((cfg.mode === "live" || name === "hubtel") && !env().PAYMENTS_LIVE_APPROVED) return null;
  }
  const v = cfg.values;
  if (name === "paystack") {
    if (!v.secretKey) return null;
    return createPaystackGateway(v.secretKey, fetch, { channels: v.channels ? v.channels.split(",") : undefined });
  }
  if (!v.apiId || !v.apiKey || !v.merchantAccountNumber) return null;
  return createHubtelGateway({ apiId: v.apiId, apiKey: v.apiKey, merchantAccountNumber: v.merchantAccountNumber, initiateUrl: v.initiateUrl, statusUrl: v.statusUrl });
}

/** Can the website take online payments right now? */
export async function paymentsReady(): Promise<boolean> {
  return (await paymentGateway(undefined, "checkout")) !== null;
}

/** Test seam: integration tests inject a gateway double. Never used at runtime. */
export function setPaymentGatewayForTests(gateway: PaymentGateway | null | undefined) {
  if (env().NODE_ENV !== "test") throw new Error("setPaymentGatewayForTests is test-only");
  override = gateway;
}
