import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/database/pool";
import { localProvider } from "./local-provider";
import { staffMfaRequired } from "./mfa";
import { isStaffRole, type Permission, type Role } from "./permissions";
import type { AuthProvider } from "./provider";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  emailVerified: boolean;
  permissions: ReadonlySet<Permission>;
  isStaff: boolean;
  mfaEnabled: boolean;
};

/** Built-in PostgreSQL-backed authentication (see lib/auth/local-provider.ts). */
export function authProvider(): AuthProvider {
  return localProvider;
}

/** Current user for this request (memoised per request). Never trust client-side role claims. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const id = await authProvider().currentUserId();
  if (!id) return null;
  const row = await db.one<{
    id: string; email: string; full_name: string; role: Role; email_verified_at: Date | null; status: string;
    permissions: Permission[] | null; mfa_enabled_at: Date | null;
  }>(
    `select u.id, u.email, u.full_name, u.role, u.email_verified_at, u.status, u.mfa_enabled_at,
            array_agg(rp.permission) filter (where rp.permission is not null) as permissions
       from users u left join role_permissions rp on rp.role = u.role
      where u.id = $1 group by u.id`,
    [id],
  );
  if (!row || row.status !== "active") return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    emailVerified: Boolean(row.email_verified_at),
    permissions: new Set(row.permissions ?? []),
    isStaff: isStaffRole(row.role),
    mfaEnabled: Boolean(row.mfa_enabled_at),
  };
});

/** Staff must enrol in MFA before using Studio when STAFF_MFA_REQUIRED (default on in production). */
export function needsMfaSetup(user: SessionUser): boolean {
  return user.isStaff && !user.mfaEnabled && staffMfaRequired();
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
  }
}

export async function requireUser(next = "/portal"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** For pages: redirects unauthenticated users and 404s unauthorised staff. */
export async function requireStaffPage(permission: Permission, next = "/admin"): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!user.isStaff) redirect("/portal");
  if (needsMfaSetup(user)) redirect("/admin/security?setup=1");
  if (!user.permissions.has(permission)) redirect("/admin?denied=1");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Please sign in.");
  if (!user.isStaff || !user.permissions.has(permission)) throw new AuthorizationError();
  if (needsMfaSetup(user)) throw new AuthorizationError("Set up two-factor authentication (Studio → Security) before making changes.");
  return user;
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Please sign in.");
  return user;
}
