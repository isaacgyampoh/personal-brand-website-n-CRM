"use server";

import { z } from "zod";
import { assertPermission, assertUser, AuthorizationError } from "@/lib/auth/session";
import { assertRecentAuth, reauthenticate } from "@/lib/auth/reauth";
import { toActionError, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { INTEGRATIONS, type IntegrationProvider } from "@/lib/integrations/definitions";
import { getIntegration, IntegrationError, saveIntegration, setIntegrationEnabled } from "@/lib/integrations/store";
import { rateLimit } from "@/lib/security/rate-limit";
import { runConnectionTest } from "../application/connection-tests";
import { disconnectGoogle, listGoogleCalendars } from "../application/google";
import { createSmtpTransport, smtpConfigFrom } from "@/features/notifications/infrastructure/email-transport";

const providerSchema = z.enum(INTEGRATIONS.map((d) => d.provider) as [IntegrationProvider, ...IntegrationProvider[]]);

async function guard() {
  const user = await assertPermission("settings:manage");
  await assertRecentAuth();
  return user;
}

function after(provider: IntegrationProvider) {
  // Public pages embed media URLs and "payments available" state.
  if (provider === "r2") invalidate("pages", "articles", "services", "events", "courses", "products", "proof");
}

export async function reauthAction(_: unknown, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    if (!user.isStaff) throw new AuthorizationError();
    await reauthenticate(user.id, String(fd.get("password") ?? ""), String(fd.get("code") ?? ""));
    await audit({ actorId: user.id, action: "auth.reauthenticated", entityType: "user", entityId: user.id });
    return { ok: true, message: "Confirmed. You can make sensitive changes for the next 15 minutes." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveIntegrationAction(_: unknown, fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const provider = providerSchema.parse(fd.get("provider"));
    const values: Record<string, string> = {};
    const multi = new Map<string, string[]>();
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string") continue;
      if (k.startsWith("f:")) values[k.slice(2)] = v;
      if (k.startsWith("m:")) multi.set(k.slice(2), [...(multi.get(k.slice(2)) ?? []), v]);
    }
    for (const [k, list] of multi) values[k] = list.filter(Boolean).join(",");
    // Checkboxes: a hidden "c:<key>" marks presence so unchecked boxes save as false.
    for (const [k] of fd.entries()) if (k.startsWith("c:")) values[k.slice(2)] = fd.get(`f:${k.slice(2)}`) === "true" ? "true" : "false";
    const clear = fd.getAll("clear").map(String);
    const mode = fd.get("mode") ? z.enum(["test", "live"]).parse(fd.get("mode")) : undefined;
    await saveIntegration(provider, { values, clear, mode }, user.id);
    after(provider);
    return { ok: true, message: "Saved. Run Test connection to verify." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function toggleIntegrationAction(_: unknown, fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const provider = providerSchema.parse(fd.get("provider"));
    const enabled = fd.get("enabled") === "true";
    await setIntegrationEnabled(provider, enabled, user.id);
    after(provider);
    return { ok: true, message: enabled ? "Enabled" : "Disabled" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function testIntegrationAction(_: unknown, fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const provider = providerSchema.parse(fd.get("provider"));
    await rateLimit(`integration-test:${user.id}:${provider}`, 10, 600);
    const message = await runConnectionTest(provider, user.id);
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendTestEmailAction(_: unknown, fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const to = z.string().trim().toLowerCase().email("Enter an email address").parse(fd.get("to"));
    await rateLimit(`test-email:${user.id}`, 5, 600);
    const c = await getIntegration("smtp");
    if (c.status === "not_configured" || c.status === "incomplete") throw new IntegrationError("Save the SMTP settings first.");
    const { transport, transporter } = await createSmtpTransport(smtpConfigFrom(c.values));
    try {
      await transport.send({
        to, subject: "Test email from your Studio",
        text: "This is a test email sent from Settings → Integrations. If you can read this, outgoing email works.",
        html: "<p>This is a test email sent from <strong>Settings → Integrations</strong>.</p><p>If you can read this, outgoing email works.</p>",
      });
    } finally {
      transporter.close();
    }
    await audit({ actorId: user.id, action: "integration.test_email", entityType: "integration", entityId: "smtp" });
    return { ok: true, message: `The SMTP server accepted a test email to ${to}. Check that inbox (and spam).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function disconnectGoogleAction(_: unknown, __: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    await disconnectGoogle(user.id);
    return { ok: true, message: "Google disconnected" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function googleCalendarsAction(): Promise<ActionResult<{ id: string; summary: string; primary: boolean }[]>> {
  try {
    await assertPermission("settings:manage");
    return { ok: true, data: await listGoogleCalendars() };
  } catch (e) {
    return toActionError(e);
  }
}
