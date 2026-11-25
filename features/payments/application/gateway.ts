import "server-only";
import { env } from "@/lib/config/env";
import { createPaystackGateway } from "../infrastructure/paystack";
import type { PaymentGateway } from "../domain/gateway";

let override: PaymentGateway | null | undefined;

/** The configured gateway, or null when payments are not configured. */
export function paymentGateway(): PaymentGateway | null {
  if (override !== undefined) return override;
  const key = env().PAYSTACK_SECRET_KEY;
  return key ? createPaystackGateway(key) : null;
}

/** Test seam: integration tests inject a gateway double. Never used at runtime. */
export function setPaymentGatewayForTests(gateway: PaymentGateway | null | undefined) {
  if (env().NODE_ENV !== "test") throw new Error("setPaymentGatewayForTests is test-only");
  override = gateway;
}
