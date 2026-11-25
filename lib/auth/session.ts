import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/database/pool";
import { env } from "@/lib/config/env";
import { localProvider } from "./local-provider";
import { supabaseProvider, supabaseUserEmail } from "./supabase-provider";
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
};

export function authProvider(): AuthProvider {
  return env().AUTH_PROVIDER === "supabase" ? supabaseProvider : localProvider;
}

/** Ensures the application `users` row exists for a Supabase identity. */
async function syncSupabaseUser(id: string) {
  const exists = await db.one("select 1 from users where id = $1", [id]);
  if (exists) return;
  const info = await supabaseUserEmail();
  if (!info || info.id !== id) return;
  await db.query(
    `insert into users (id, email, full_name, email_verified_at) values ($1, $2, $3, case when $4 then now() end)
     on conflict (id) do nothing`,
    [id, info.email, info.fullName, info.verified],
  );
}

/** Current user for this request (memoised per request). Never trust client-side role claims. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const provider = authProvider();
  const id = await provider.currentUserId();
  if (!id) return null;
  if (provider.name === "supabase") await syncSupabaseUser(id);
  const row = await db.one<{
    id: string; email: string; full_name: string; role: Role; email_verified_at: Date | null; status: string;
    permissions: Permission[] | null;
  }>(
    `select u.id, u.email, u.full_name, u.role, u.email_verified_at, u.status,
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
  };
});

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
  if (!user.permissions.has(permission)) redirect("/admin?denied=1");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Please sign in.");
  if (!user.isStaff || !user.permissions.has(permission)) throw new AuthorizationError();
  return user;
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Please sign in.");
  return user;
}
