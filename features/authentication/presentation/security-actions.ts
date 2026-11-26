"use server";

import { z } from "zod";
import { assertUser, AuthorizationError } from "@/lib/auth/session";
import { assertRecentAuth } from "@/lib/auth/reauth";
import { beginMfaEnrolment, confirmMfaEnrolment, disableMfa, regenerateRecoveryCodes, staffMfaRequired } from "@/lib/auth/mfa";
import { toActionError, type ActionResult } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { UserError } from "@/lib/errors";
import { loadSetting } from "@/features/settings/application/settings";

async function staff() {
  const u = await assertUser();
  if (!u.isStaff) throw new AuthorizationError();
  return u;
}

export async function beginMfaAction(): Promise<ActionResult<{ secret: string; uri: string }>> {
  try {
    const u = await staff();
    if (u.mfaEnabled) throw new UserError("Two-factor authentication is already on.");
    await assertRecentAuth();
    const brand = (await loadSetting("brand")).name || "Studio";
    return { ok: true, data: await beginMfaEnrolment(u.id, u.email, `${brand} Studio`) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmMfaAction(_: unknown, fd: FormData): Promise<ActionResult<{ codes: string[] }>> {
  try {
    const u = await staff();
    await rateLimit(`mfa-enrol:${u.id}`, 10, 900);
    const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code").parse(fd.get("code"));
    const codes = await confirmMfaEnrolment(u.id, code);
    if (!codes) throw new UserError("That code didn't match. Check the time on your phone and try the newest code.");
    await audit({ actorId: u.id, action: "auth.mfa_enabled", entityType: "user", entityId: u.id });
    return { ok: true, data: { codes } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function regenerateCodesAction(): Promise<ActionResult<{ codes: string[] }>> {
  try {
    const u = await staff();
    await assertRecentAuth();
    const codes = await regenerateRecoveryCodes(u.id);
    await audit({ actorId: u.id, action: "auth.mfa_recovery_regenerated", entityType: "user", entityId: u.id });
    return { ok: true, data: { codes } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function disableMfaAction(_: unknown, __: FormData): Promise<ActionResult> {
  try {
    const u = await staff();
    if (staffMfaRequired()) throw new UserError("Two-factor authentication is required for staff accounts and can't be turned off.");
    await assertRecentAuth();
    await disableMfa(u.id);
    await audit({ actorId: u.id, action: "auth.mfa_disabled", entityType: "user", entityId: u.id });
    return { ok: true, message: "Two-factor authentication turned off" };
  } catch (e) {
    return toActionError(e);
  }
}
