import "server-only";
import { getIntegration, IntegrationError, recordTestResult } from "@/lib/integrations/store";
import type { IntegrationProvider } from "@/lib/integrations/definitions";
import { createPaystackGateway } from "@/features/payments/infrastructure/paystack";
import { createHubtelGateway } from "@/features/payments/infrastructure/hubtel";
import { createSmtpTransport, smtpConfigFrom } from "@/features/notifications/infrastructure/email-transport";
import { testMnotify } from "@/features/notifications/infrastructure/sms-mnotify";
import { testAiConnection } from "@/features/ai/application/assistant";
import { createR2Storage } from "@/lib/storage";
import { testGoogle } from "./google";
import { testZoom } from "./zoom";

/**
 * Runs a REAL connection test against the provider with the stored
 * configuration, and records the outcome against that exact configuration.
 * Only a passing test can make an integration show "Connected".
 * Error messages are provider responses / our own text — never credentials.
 */
export async function runConnectionTest(provider: IntegrationProvider, actorId: string): Promise<string> {
  const c = await getIntegration(provider);
  const v = c.values;
  if (c.status === "not_configured" || c.status === "incomplete") throw new IntegrationError("Complete and save the required fields first.");
  if (provider === "google") return testGoogle(actorId); // records its own result
  try {
    const message = await run(provider, v, c.mode);
    await recordTestResult(provider, true, null, actorId);
    return message;
  } catch (e) {
    const msg = scrub((e as Error).message, v);
    await recordTestResult(provider, false, msg, actorId);
    throw new IntegrationError(`Connection failed: ${msg}`);
  }
}

/** Defence in depth: never echo a configured secret back, even if a provider includes it in an error. */
function scrub(message: string, values: Record<string, string>): string {
  let out = message.slice(0, 300);
  for (const val of Object.values(values)) if (val && val.length >= 8) out = out.split(val).join("[redacted]");
  return out;
}

async function run(provider: IntegrationProvider, v: Record<string, string>, mode: "test" | "live"): Promise<string> {
  switch (provider) {
    case "paystack": {
      if (!v.publicKey.startsWith(`pk_${mode}_`) || !v.secretKey.startsWith(`sk_${mode}_`)) throw new Error(`The ${mode} keys don't match ${mode} mode.`);
      return createPaystackGateway(v.secretKey).testConnection();
    }
    case "hubtel":
      return createHubtelGateway({ apiId: v.apiId, apiKey: v.apiKey, merchantAccountNumber: v.merchantAccountNumber, initiateUrl: v.initiateUrl, statusUrl: v.statusUrl }).testConnection();
    case "smtp": {
      const { transporter } = await createSmtpTransport(smtpConfigFrom(v));
      try {
        await transporter.verify();
      } finally {
        transporter.close();
      }
      return `SMTP server ${v.host}:${v.port} accepted the login`;
    }
    case "r2": {
      const store = createR2Storage({ accountId: v.accountId, accessKeyId: v.accessKeyId, secretAccessKey: v.secretAccessKey, publicBucket: v.publicBucket, privateBucket: v.privateBucket, publicBaseUrl: v.publicBaseUrl });
      const key = `healthcheck/${Date.now()}.txt`;
      for (const vis of ["public", "private"] as const) {
        await store.put(key, Buffer.from("ok"), "text/plain", vis);
        const back = await store.get(key, vis);
        await store.remove(key, vis);
        if (back?.toString() !== "ok") throw new Error(`Could not read back from the ${vis} bucket.`);
      }
      return "Both buckets accepted a write, read and delete";
    }
    case "mnotify":
      return testMnotify(v.apiKey);
    case "ai":
      return testAiConnection(v.apiKey, v.model || "claude-opus-5-5");
    case "zoom":
      return testZoom({ accountId: v.accountId, clientId: v.clientId, clientSecret: v.clientSecret, hostUser: v.hostUser || "me", waitingRoom: v.waitingRoom !== "false" });
    default:
      throw new Error("Unknown integration");
  }
}
