"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authProvider } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { ipHash } from "@/lib/security/request";
import { passwordProblems } from "@/lib/security/passwords";
import { runAction, toActionError, type ActionResult } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { db } from "@/lib/database/pool";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { UserError } from "@/lib/errors";
import { safeNext } from "@/lib/auth/safe-next";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);


async function landingFor(userId: string, next: string | null): Promise<string> {
  const u = await db.one<{ role: string }>("select role from users where id = $1", [userId]);
  const staff = u && u.role !== "customer";
  if (next && (!next.startsWith("/admin") || staff)) return next;
  return staff ? "/admin" : "/portal";
}

export async function loginAction(_: unknown, fd: FormData): Promise<ActionResult> {
  let target: string;
  try {
    const input = z.object({ email, password: z.string().min(1, "Enter your password").max(200) }).parse(Object.fromEntries(fd));
    const ip = await ipHash();
    await rateLimit(`login-ip:${ip}`, 20, 900);
    await rateLimit(`login-email:${input.email}`, 10, 900);
    const result = await authProvider().signIn(input);
    if (!result.ok) {
      await audit({ actorLabel: input.email, action: "auth.login_failed", entityType: "user", ipHash: ip });
      throw new UserError(result.error);
    }
    await attachVerifiedUser(result.userId);
    await audit({ actorId: result.userId, action: "auth.login", entityType: "user", entityId: result.userId, ipHash: ip });
    target = await landingFor(result.userId, safeNext(fd.get("next"), "") || null);
  } catch (error) {
    return toActionError(error);
  }
  redirect(target);
}

export async function magicLinkAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ email }).parse(Object.fromEntries(fd));
    await rateLimit(`magic-ip:${await ipHash()}`, 10, 900);
    await rateLimit(`magic-email:${input.email}`, 3, 900);
    await authProvider().sendMagicLink(input.email, safeNext(fd.get("next"), "/portal"));
    return undefined;
  });
}

export async function registerAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      fullName: z.string().trim().min(2, "Enter your name").max(120),
      email,
      password: z.string().max(200),
      acceptTerms: z.literal("on", { message: "Please accept the terms" }),
    }).parse(Object.fromEntries(fd));
    const problems = passwordProblems(input.password, input.email);
    if (problems.length) return Promise.reject(new UserError(problems.join(" ")));
    await rateLimit(`register:${await ipHash()}`, 5, 3600);
    const r = await authProvider().signUp(input);
    // Do not reveal whether an account exists.
    if (!r.ok && !/already exists/i.test(r.error)) throw new UserError(r.error);
    if (r.ok && authProvider().name === "supabase") {
      await db.query("insert into users (id, email, full_name) values ($1,$2,$3) on conflict do nothing", [r.userId, input.email, input.fullName]);
    }
    return undefined;
  });
}

export async function forgotPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ email }).parse(Object.fromEntries(fd));
    await rateLimit(`reset-ip:${await ipHash()}`, 10, 3600);
    await rateLimit(`reset-email:${input.email}`, 3, 3600);
    await authProvider().requestPasswordReset(input.email);
    return undefined; // same response whether or not the account exists
  });
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ token: z.string().max(200).optional(), password: z.string().max(200), confirm: z.string() }).parse(Object.fromEntries(fd));
    if (input.password !== input.confirm) throw new UserError("Passwords don't match.");
    const problems = passwordProblems(input.password);
    if (problems.length) throw new UserError(problems.join(" "));
    await rateLimit(`reset-complete:${await ipHash()}`, 10, 3600);
    const r = await authProvider().completePasswordReset({ token: input.token, password: input.password });
    if (!r.ok) throw new UserError(r.error);
    await audit({ actorId: r.userId, action: "auth.password_reset", entityType: "user", entityId: r.userId });
    return undefined;
  });
}

export async function logoutAction() {
  await authProvider().signOut();
  redirect("/login");
}
