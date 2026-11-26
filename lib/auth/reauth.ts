import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/database/pool";
import { hashToken } from "@/lib/security/crypto";
import { verifyPassword } from "@/lib/security/passwords";
import { rateLimit } from "@/lib/security/rate-limit";
import { UserError } from "@/lib/errors";
import { SESSION_COOKIE } from "./local-provider";
import { checkSecondFactor } from "./mfa";

/**
 * "Recent authentication" for sensitive changes (integration credentials,
 * staff and roles, refunds, MFA changes): the user must have signed in or
 * re-entered their password (and MFA code, if enabled) in the last 15 minutes.
 */
export const REAUTH_MINUTES = 15;

export class ReauthRequiredError extends UserError {
  constructor() {
    super("For your security, confirm your password to continue.");
  }
}

async function sessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token && token.length <= 100 ? hashToken(token) : null;
}

export async function hasRecentAuth(): Promise<boolean> {
  const h = await sessionHash();
  if (!h) return false;
  const r = await db.one(
    `select 1 from sessions where token_hash = $1 and revoked_at is null and not mfa_pending
        and reauthenticated_at > now() - make_interval(mins => $2)`,
    [h, REAUTH_MINUTES],
  );
  return Boolean(r);
}

export async function assertRecentAuth(): Promise<void> {
  if (!(await hasRecentAuth())) throw new ReauthRequiredError();
}

export async function reauthenticate(userId: string, password: string, code: string): Promise<void> {
  await rateLimit(`reauth:${userId}`, 8, 900);
  const u = await db.one<{ password_hash: string | null; mfa_enabled_at: Date | null }>("select password_hash, mfa_enabled_at from users where id = $1", [userId]);
  if (!u?.password_hash || !(await verifyPassword(password, u.password_hash))) throw new UserError("That password isn't right.");
  if (u.mfa_enabled_at && !(await checkSecondFactor(userId, code))) throw new UserError("Enter a valid authenticator or recovery code.");
  await db.query("update sessions set reauthenticated_at = now() where token_hash = $1", [await sessionHash()]);
}
