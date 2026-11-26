import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/database/pool";
import { decrypt, encrypt, hashToken } from "@/lib/security/crypto";
import { generateRecoveryCodes, generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/security/totp";
import { env } from "@/lib/config/env";
import { SESSION_COOKIE } from "./local-provider";

/**
 * Staff multi-factor authentication (TOTP + single-use recovery codes).
 * MFA secrets are encrypted with the application secret; recovery codes are
 * stored only as keyed hashes. Required for staff when STAFF_MFA_REQUIRED
 * (default: on in production).
 */
export function staffMfaRequired(): boolean {
  const v = process.env.STAFF_MFA_REQUIRED;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return env().NODE_ENV === "production";
}

async function sessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token && token.length <= 100 ? hashToken(token) : null;
}

/** User id of a session that has passed the password step but not yet the second factor. */
export async function pendingMfaUserId(): Promise<string | null> {
  const h = await sessionHash();
  if (!h) return null;
  const r = await db.one<{ user_id: string }>(
    "select user_id from sessions where token_hash = $1 and mfa_pending and revoked_at is null and expires_at > now() and created_at > now() - interval '15 minutes'",
    [h],
  );
  return r?.user_id ?? null;
}

type MfaRow = { mfa_secret_encrypted: string | null; mfa_enabled_at: Date | null; mfa_recovery_codes: string[]; mfa_last_step: string | null };

/** Checks a TOTP code or recovery code for the user; consumes recovery codes and records the TOTP step. */
export async function checkSecondFactor(userId: string, code: string): Promise<boolean> {
  const u = await db.one<MfaRow>("select mfa_secret_encrypted, mfa_enabled_at, mfa_recovery_codes, mfa_last_step from users where id = $1", [userId]);
  if (!u?.mfa_secret_encrypted || !u.mfa_enabled_at) return false;
  const trimmed = code.trim().toLowerCase();
  if (/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(trimmed)) {
    const h = hashToken(`recovery:${trimmed}`);
    const r = await db.one(
      `update users set mfa_recovery_codes = mfa_recovery_codes - $2 where id = $1 and mfa_recovery_codes ? $2 returning id`,
      [userId, h],
    );
    return Boolean(r);
  }
  const step = verifyTotp(decrypt(u.mfa_secret_encrypted), trimmed, { lastStep: u.mfa_last_step ? Number(u.mfa_last_step) : null });
  if (step === null) return false;
  // Conditional update so two concurrent requests can't both use the same step.
  const r = await db.one("update users set mfa_last_step = $2 where id = $1 and (mfa_last_step is null or mfa_last_step < $2) returning id", [userId, step]);
  return Boolean(r);
}

/** Completes a pending sign-in after a valid second factor. */
export async function completeMfaSignIn(code: string): Promise<string | null> {
  const userId = await pendingMfaUserId();
  if (!userId) return null;
  if (!(await checkSecondFactor(userId, code))) return null;
  const h = await sessionHash();
  await db.query("update sessions set mfa_pending = false, mfa_verified = true, reauthenticated_at = now() where token_hash = $1", [h]);
  await db.query("update users set last_login_at = now() where id = $1", [userId]);
  return userId;
}

/** Step 1 of enrolment: stores a new (not yet active) secret and returns setup details. */
export async function beginMfaEnrolment(userId: string, email: string, issuer: string): Promise<{ secret: string; uri: string }> {
  const secret = generateTotpSecret();
  await db.query("update users set mfa_secret_encrypted = $2 where id = $1 and mfa_enabled_at is null", [userId, encrypt(secret)]);
  return { secret, uri: otpauthUri(secret, email, issuer) };
}

/** Step 2: verifies a code from the authenticator app, activates MFA and returns recovery codes (shown once). */
export async function confirmMfaEnrolment(userId: string, code: string): Promise<string[] | null> {
  const u = await db.one<MfaRow>("select mfa_secret_encrypted, mfa_enabled_at, mfa_recovery_codes, mfa_last_step from users where id = $1", [userId]);
  if (!u?.mfa_secret_encrypted || u.mfa_enabled_at) return null;
  const step = verifyTotp(decrypt(u.mfa_secret_encrypted), code);
  if (step === null) return null;
  const codes = generateRecoveryCodes();
  await db.query(
    "update users set mfa_enabled_at = now(), mfa_last_step = $2, mfa_recovery_codes = $3 where id = $1",
    [userId, step, JSON.stringify(codes.map((c) => hashToken(`recovery:${c}`)))],
  );
  const h = await sessionHash();
  if (h) await db.query("update sessions set mfa_verified = true, reauthenticated_at = now() where token_hash = $1", [h]);
  // Other sessions were created without the second factor: sign them out.
  await db.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and token_hash <> $2", [userId, h ?? ""]);
  return codes;
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.query("update users set mfa_recovery_codes = $2 where id = $1 and mfa_enabled_at is not null", [userId, JSON.stringify(codes.map((c) => hashToken(`recovery:${c}`)))]);
  return codes;
}

export async function disableMfa(userId: string): Promise<void> {
  await db.query("update users set mfa_enabled_at = null, mfa_secret_encrypted = null, mfa_recovery_codes = '[]'::jsonb, mfa_last_step = null where id = $1", [userId]);
}

export async function mfaStatus(userId: string): Promise<{ enabled: boolean; recoveryCodesLeft: number }> {
  const u = await db.one<{ mfa_enabled_at: Date | null; n: number }>("select mfa_enabled_at, jsonb_array_length(mfa_recovery_codes) as n from users where id = $1", [userId]);
  return { enabled: Boolean(u?.mfa_enabled_at), recoveryCodesLeft: u?.n ?? 0 };
}
