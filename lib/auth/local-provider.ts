import "server-only";
import { cookies } from "next/headers";
import { db, tx } from "@/lib/database/pool";
import { hashPassword, verifyPassword } from "@/lib/security/passwords";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { env } from "@/lib/config/env";
import { enqueueEmail } from "@/features/notifications/application/send";
import type { AuthProvider, AuthResult } from "./provider";

export const SESSION_COOKIE = "bp_session";
const SESSION_DAYS = 14;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, hashToken(token), expires],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

async function issueToken(email: string, userId: string | null, purpose: string, minutes: number): Promise<string> {
  const token = randomToken(32);
  await db.query(
    `insert into auth_tokens (user_id, email, purpose, token_hash, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [userId, email, purpose, hashToken(token), minutes],
  );
  return token;
}

async function consumeToken(token: string, purpose: string): Promise<{ user_id: string | null; email: string } | null> {
  return db.one(
    `update auth_tokens set used_at = now()
     where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
     returning user_id, email`,
    [hashToken(token), purpose],
  );
}

export const localProvider: AuthProvider = {
  name: "local",

  async signUp({ email, password, fullName }) {
    const existing = await db.one<{ id: string; password_hash: string | null }>(
      "select id, password_hash from users where email = $1",
      [email],
    );
    if (existing?.password_hash) return { ok: false, error: "An account with this email already exists." };
    const hash = await hashPassword(password);
    const row = existing
      ? await db.one<{ id: string }>("update users set password_hash = $2, full_name = coalesce(nullif($3,''), full_name) where id = $1 returning id", [existing.id, hash, fullName])
      : await db.one<{ id: string }>(
          "insert into users (email, full_name, password_hash) values ($1, $2, $3) returning id",
          [email, fullName, hash],
        );
    await this.sendVerification(row!.id, email);
    return { ok: true, userId: row!.id, needsVerification: true };
  },

  async signIn({ email, password }): Promise<AuthResult> {
    const user = await db.one<{
      id: string; password_hash: string | null; status: string; locked_until: Date | null;
    }>("select id, password_hash, status, locked_until from users where email = $1", [email]);
    const generic = { ok: false as const, error: "Email or password is incorrect." };
    if (!user || !user.password_hash) {
      // Equalise timing with a dummy verification.
      await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
      return generic;
    }
    if (user.locked_until && user.locked_until > new Date()) {
      return { ok: false, error: "Too many failed attempts. Try again in a few minutes or reset your password." };
    }
    if (user.status !== "active") return generic;
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await db.query(
        `update users set failed_login_count = failed_login_count + 1,
           locked_until = case when failed_login_count + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
         where id = $1`,
        [user.id, MAX_FAILED, LOCK_MINUTES],
      );
      return generic;
    }
    await db.query("update users set failed_login_count = 0, locked_until = null, last_login_at = now() where id = $1", [user.id]);
    await createSession(user.id);
    return { ok: true, userId: user.id };
  },

  async signOut() {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await db.query("update sessions set revoked_at = now() where token_hash = $1", [hashToken(token)]);
    jar.delete(SESSION_COOKIE);
  },

  async currentUserId() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token || token.length > 100) return null;
    const row = await db.one<{ user_id: string }>(
      `select s.user_id from sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`,
      [hashToken(token)],
    );
    return row?.user_id ?? null;
  },

  async requestPasswordReset(email) {
    const user = await db.one<{ id: string }>("select id from users where email = $1 and status = 'active'", [email]);
    if (!user) return; // do not reveal whether the account exists
    const token = await issueToken(email, user.id, "reset_password", 60);
    await enqueueEmail({
      to: email,
      template: "password_reset",
      data: { resetUrl: `${env().APP_URL}/reset-password?token=${token}` },
      idempotencyKey: `reset:${hashToken(token)}`,
    });
  },

  async completePasswordReset({ token, password }) {
    if (!token) return { ok: false, error: "This reset link is invalid or has expired." };
    return tx(async (t) => {
      const row = await t.one<{ user_id: string }>(
        `update auth_tokens set used_at = now()
         where token_hash = $1 and purpose = 'reset_password' and used_at is null and expires_at > now()
         returning user_id`,
        [hashToken(token)],
      );
      if (!row?.user_id) return { ok: false as const, error: "This reset link is invalid or has expired." };
      await t.query(
        `update users set password_hash = $2, failed_login_count = 0, locked_until = null,
           email_verified_at = coalesce(email_verified_at, now()) where id = $1`,
        [row.user_id, await hashPassword(password)],
      );
      await t.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [row.user_id]);
      return { ok: true as const, userId: row.user_id };
    });
  },

  async sendVerification(userId, email) {
    const token = await issueToken(email, userId, "verify_email", 60 * 24);
    await enqueueEmail({
      to: email,
      template: "verify_email",
      data: { verifyUrl: `${env().APP_URL}/verify-email?token=${token}` },
      idempotencyKey: `verify:${hashToken(token)}`,
    });
  },

  async verifyEmail(token) {
    const row = await consumeToken(token, "verify_email");
    if (!row?.user_id) return { ok: false, error: "This verification link is invalid or has expired." };
    await db.query("update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [row.user_id]);
    return { ok: true, userId: row.user_id };
  },

  async sendMagicLink(email, next) {
    const token = await issueToken(email, null, "magic_link", 30);
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/portal";
    await enqueueEmail({
      to: email,
      template: "magic_link",
      data: { loginUrl: `${env().APP_URL}/auth/magic?token=${token}&next=${encodeURIComponent(safeNext)}` },
      idempotencyKey: `magic:${hashToken(token)}`,
    });
  },

  async consumeMagicLink(token) {
    const row = await consumeToken(token, "magic_link");
    if (!row) return { ok: false, error: "This sign-in link is invalid or has expired." };
    // Proving control of the mailbox verifies the email address.
    const user = await db.one<{ id: string }>(
      `insert into users (email, email_verified_at) values ($1, now())
       on conflict (email) do update set email_verified_at = coalesce(users.email_verified_at, now())
       returning id`,
      [row.email],
    );
    await createSession(user!.id);
    return { ok: true, userId: user!.id };
  },
};
