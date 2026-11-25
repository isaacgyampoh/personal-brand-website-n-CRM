import { UserError } from "@/lib/errors";
/** Payment provider port. Paystack is the first adapter; others can follow. */

export type VerifiedTransaction = {
  reference: string;
  status: "success" | "failed" | "abandoned" | "pending" | "reversed" | "unknown";
  amountMinor: number;
  currency: string;
  channel: string | null;
  providerTransactionId: string | null;
  gatewayResponse: string | null;
  paidAt: Date | null;
};

export type WebhookEvent = {
  /** Unique, provider-derived key used for idempotent storage. */
  eventKey: string;
  type: string;
  reference: string | null;
  refundId: string | null;
  payload: unknown;
};

export interface PaymentGateway {
  readonly name: "paystack";
  readonly mode: "test" | "live";
  initialize(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; accessCode: string | null }>;
  verify(reference: string): Promise<VerifiedTransaction>;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string): WebhookEvent;
  refund(input: { reference: string; amountMinor: number; note: string }): Promise<{ providerRefundId: string; status: string }>;
  fetchRefund(providerRefundId: string): Promise<{ status: "pending" | "processing" | "processed" | "failed"; raw: unknown }>;
}

export class PaymentsNotConfiguredError extends UserError {
  constructor() {
    super("Online payments are not configured yet. Please contact us to complete your booking.");
  }
}
