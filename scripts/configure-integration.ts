/**
 * Operator tool: saves an integration's settings into the encrypted vault (exactly as
 * Studio → Integrations does), runs the real connection test and enables it only if the
 * test passes. Values are read as JSON from stdin — never from arguments, env or logs.
 *
 *   cat smtp.json | docker compose exec -T worker npx tsx --tsconfig tsconfig.worker.json scripts/configure-integration.ts smtp [--test-to someone@example.com]
 *
 * The business owner can change or disable everything afterwards in Studio.
 */
import { closePool } from "@/lib/database/pool";
import { saveIntegration, setIntegrationEnabled } from "@/lib/integrations/store";
import type { IntegrationProvider } from "@/lib/integrations/definitions";
import { runConnectionTest } from "@/features/integrations/application/connection-tests";
import { emailTransport } from "@/features/notifications/infrastructure/email-transport";

const ALLOWED: IntegrationProvider[] = ["smtp", "r2"]; // payments are configured by the client in Studio, never here

async function main() {
  const provider = process.argv[2] as IntegrationProvider;
  if (!ALLOWED.includes(provider)) throw new Error(`provider must be one of ${ALLOWED.join(", ")}`);
  const i = process.argv.indexOf("--test-to");
  const testTo = i > 0 ? process.argv[i + 1] : undefined;
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const values = JSON.parse(raw) as Record<string, string>;

  const system = null as unknown as string; // recorded as the server shell, not a user
  await saveIntegration(provider, { values }, system);
  const message = await runConnectionTest(provider, system); // records its own result; throws on failure
  await setIntegrationEnabled(provider, true, system);
  console.log(`${provider}: connection test passed (${message}); enabled`);

  if (provider === "smtp" && testTo) {
    const r = await (await emailTransport()).send({
      to: testTo, subject: "Test email from your website",
      text: "This is a test email from your website's Studio. If you can read it, email sending works.",
      html: "<p>This is a test email from your website's Studio.</p><p>If you can read it, email sending works.</p>",
    });
    // Accepted by the provider — delivery is confirmed separately (provider log / inbox).
    console.log(`test email accepted by ${r.provider} (message id ${r.messageId ?? "n/a"})`);
  }
}

main().catch((e) => { console.error("configure-integration failed:", (e as Error).message); process.exitCode = 1; }).finally(() => closePool());
