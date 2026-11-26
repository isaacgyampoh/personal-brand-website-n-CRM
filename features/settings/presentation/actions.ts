"use server";

import { z } from "zod";
import { assertPermission, authProvider } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { PERMISSIONS, STAFF_ROLES } from "@/lib/auth/permissions";
import { DEFAULT_TEMPLATES } from "@/features/notifications/domain/templates";
import { cancelJob, retryJob } from "@/lib/jobs/queue";

export async function saveTemplateAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("settings:manage");
    const key = z.string().refine((k) => k in DEFAULT_TEMPLATES).parse(fd.get("key"));
    if (fd.get("op") === "reset") { await db.query("delete from email_templates where key = $1", [key]); return undefined; }
    const subject = z.string().trim().min(1).max(300).parse(fd.get("subject"));
    const body = z.string().trim().min(1).max(50000).parse(fd.get("body"));
    await db.query("insert into email_templates (key, subject, body, updated_by) values ($1,$2,$3,$4) on conflict (key) do update set subject = excluded.subject, body = excluded.body, updated_by = excluded.updated_by", [key, subject, body, u.id]);
    await audit({ actorId: u.id, action: "email_template.update", entityType: "email_template", entityId: key });
    return undefined;
  });
}

export async function inviteStaffAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("users:manage");
    const i = z.object({ email: z.string().trim().toLowerCase().email(), fullName: z.string().trim().min(1).max(120), role: z.enum(["admin", "content_manager", "booking_manager", "finance_manager"]) }).parse(Object.fromEntries(fd));
    if (i.role === "admin" && u.role !== "owner") throw new UserError("Only the business owner can create administrators.");
    const existing = await db.one<{ role: string }>("select role from users where email = $1", [i.email]);
    if (existing?.role === "owner") throw new UserError("That account is the owner.");
    await db.query(
      `insert into users (email, full_name, role) values ($1,$2,$3) on conflict (email) do update set role = excluded.role, full_name = coalesce(nullif(users.full_name,''), excluded.full_name)`,
      [i.email, i.fullName, i.role],
    );
    // A single-use sign-in link proves they own the mailbox; they can then set a password.
    await authProvider().sendMagicLink(i.email, "/admin");
    await audit({ actorId: u.id, action: "user.invite", entityType: "user", entityId: i.email, data: { role: i.role } });
    return undefined;
  });
}

export async function updateStaffAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("users:manage");
    const id = z.string().uuid().parse(fd.get("id"));
    const target = await db.one<{ role: string }>("select role from users where id = $1", [id]);
    if (!target) throw new UserError("User not found.");
    if (target.role === "owner") throw new UserError("The owner account can't be changed here.");
    if (id === u.id) throw new UserError("You can't change your own access.");
    const op = z.enum(["role", "suspend", "activate"]).parse(fd.get("op"));
    if (op === "role") {
      const role = z.enum(["admin", "content_manager", "booking_manager", "finance_manager", "customer"]).parse(fd.get("role"));
      if ((role === "admin" || target.role === "admin") && u.role !== "owner") throw new UserError("Only the owner can grant or remove admin access.");
      await db.query("update users set role = $2 where id = $1", [id, role]);
    } else {
      await db.query("update users set status = $2 where id = $1", [id, op === "suspend" ? "suspended" : "active"]);
      if (op === "suspend") await db.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [id]);
    }
    await audit({ actorId: u.id, action: `user.${op}`, entityType: "user", entityId: id, data: { role: fd.get("role") } });
    return undefined;
  });
}

export async function rolePermissionsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("users:manage");
    if (u.role !== "owner") throw new UserError("Only the business owner can change role permissions.");
    const role = z.enum(["content_manager", "booking_manager", "finance_manager", "admin"]).parse(fd.get("role"));
    const perms = fd.getAll("permissions").map(String).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
    if (role === "admin" && !perms.includes("users:manage")) throw new UserError("Administrators must keep user management.");
    await db.query("delete from role_permissions where role = $1", [role]);
    for (const p of perms) await db.query("insert into role_permissions (role, permission) values ($1,$2)", [role, p]);
    await audit({ actorId: u.id, action: "role.permissions", entityType: "role", entityId: role, data: { perms } });
    void STAFF_ROLES;
    return undefined;
  });
}

export async function jobAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("jobs:manage");
    const id = z.coerce.number().int().parse(fd.get("id"));
    if (fd.get("op") === "cancel") await cancelJob(id); else await retryJob(id);
    await audit({ actorId: u.id, action: `job.${fd.get("op")}`, entityType: "job", entityId: String(id) });
    return undefined;
  });
}

export async function disconnectIntegrationAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("settings:manage");
    const provider = z.enum(["google_calendar", "zoom"]).parse(fd.get("provider"));
    await db.query("update integrations set status = 'disconnected', credentials_encrypted = null where provider = $1", [provider]);
    await audit({ actorId: u.id, action: "integration.disconnect", entityType: "integration", entityId: provider });
    return undefined;
  });
}
