import { receiveWebhook } from "@/features/payments/application/webhooks";

export const dynamic = "force-dynamic";

/** Paystack webhook. The raw body is required for HMAC-SHA512 verification. */
export async function POST(request: Request) {
  const raw = await request.text();
  const result = await receiveWebhook(raw, request.headers.get("x-paystack-signature"));
  return new Response(result.body, { status: result.status, headers: { "content-type": "text/plain" } });
}
