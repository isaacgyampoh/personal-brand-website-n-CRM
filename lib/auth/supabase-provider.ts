import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/config/env";
import type { AuthProvider, AuthResult } from "./provider";

/**
 * Supabase Auth adapter. Supabase sends verification / recovery / magic-link
 * emails itself; configure its email templates to link to
 *   {APP_URL}/auth/confirm?token_hash={{ .TokenHash }}&type=<signup|recovery|magiclink>
 * (see docs/SETUP.md). The `users` row is kept in sync with the same id.
 *
 * Status: implemented against @supabase/ssr 0.12 / supabase-js 2.119 APIs.
 * UNVERIFIED until Supabase project credentials are provided.
 */
async function client() {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase Auth is selected but NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY are not configured.");
  }
  const jar = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a Server Component render: cookies are read-only there.
          // Session refresh is persisted by proxy.ts / Server Actions instead.
        }
      },
    },
  });
}

const fail = (error: { message: string } | null, fallback: string): AuthResult => ({
  ok: false,
  error: error?.message || fallback,
});

export const supabaseProvider: AuthProvider = {
  name: "supabase",

  async signUp({ email, password, fullName }) {
    const sb = await client();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${env().APP_URL}/auth/confirm` },
    });
    if (error || !data.user) return fail(error, "Could not create account.");
    return { ok: true, userId: data.user.id, needsVerification: !data.session };
  },

  async signIn({ email, password }) {
    const sb = await client();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, error: "Email or password is incorrect." };
    return { ok: true, userId: data.user.id };
  },

  async signOut() {
    const sb = await client();
    await sb.auth.signOut();
  },

  async currentUserId() {
    const sb = await client();
    // getClaims verifies the JWT signature (asymmetric keys) without trusting cookies blindly.
    const { data, error } = await sb.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return String(data.claims.sub);
  },

  async requestPasswordReset(email) {
    const sb = await client();
    await sb.auth.resetPasswordForEmail(email, { redirectTo: `${env().APP_URL}/auth/confirm?next=/reset-password` });
  },

  async completePasswordReset({ password }) {
    const sb = await client();
    const { data, error } = await sb.auth.updateUser({ password });
    if (error || !data.user) return fail(error, "This reset link is invalid or has expired.");
    return { ok: true, userId: data.user.id };
  },

  async sendVerification(_userId, email) {
    const sb = await client();
    await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${env().APP_URL}/auth/confirm` } });
  },

  async verifyEmail(tokenHash) {
    const sb = await client();
    const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (error || !data.user) return fail(error, "This verification link is invalid or has expired.");
    return { ok: true, userId: data.user.id };
  },

  async sendMagicLink(email, next) {
    const sb = await client();
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/portal";
    await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${env().APP_URL}/auth/confirm?next=${encodeURIComponent(safeNext)}` },
    });
  },

  async consumeMagicLink(tokenHash) {
    const sb = await client();
    const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error || !data.user) return fail(error, "This sign-in link is invalid or has expired.");
    return { ok: true, userId: data.user.id };
  },
};

/** Supabase user email for syncing the local `users` row after sign-in. */
export async function supabaseUserEmail(): Promise<{ id: string; email: string; fullName: string; verified: boolean } | null> {
  const sb = await client();
  const { data } = await sb.auth.getUser();
  if (!data.user?.email) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    fullName: String(data.user.user_metadata?.full_name ?? ""),
    verified: Boolean(data.user.email_confirmed_at),
  };
}
