import { receiveHubtelCallback } from "@/features/payments/application/webhooks";

export const dynamic = "force-dynamic";

/** Hubtel checkout callback. Authenticated by our signed token; outcome re-verified via Hubtel's status API. */
export async function POST(request: Request) {
  const raw = await request.text();
  const token = new URL(request.url).searchParams.get("token");
  const result = await receiveHubtelCallback(raw, token);
  return new Response(result.body, { status: result.status, headers: { "content-type": "text/plain" } });
}
