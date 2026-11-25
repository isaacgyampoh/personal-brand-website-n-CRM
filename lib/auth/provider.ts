import "server-only";

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Port for identity providers. Business code depends only on this interface,
 * so Supabase Auth can be replaced (e.g. on self-hosted infrastructure) by
 * swapping the adapter — see docs/MIGRATION.md.
 */
export interface AuthProvider {
  readonly name: "local" | "supabase";
  /** Creates the identity. Caller ensures a matching row exists in `users`. */
  signUp(input: { email: string; password: string; fullName: string }): Promise<AuthResult & { needsVerification?: boolean }>;
  signIn(input: { email: string; password: string }): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Identity id from the current request's cookies, or null. */
  currentUserId(): Promise<string | null>;
  requestPasswordReset(email: string): Promise<void>;
  /** Completes a reset. Local: token from email. Supabase: user is already in a recovery session. */
  completePasswordReset(input: { token?: string; password: string }): Promise<AuthResult>;
  sendVerification(userId: string, email: string): Promise<void>;
  verifyEmail(token: string): Promise<AuthResult>;
  /** Passwordless sign-in link (used to claim guest purchases securely). */
  sendMagicLink(email: string, next: string): Promise<void>;
  consumeMagicLink(token: string): Promise<AuthResult>;
}
