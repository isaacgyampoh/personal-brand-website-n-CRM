"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser, authProvider } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { ipHash } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { isValidTimeZone } from "@/lib/time";
import { cancelAppointment, rescheduleAppointment } from "@/features/bookings/application/booking";
import { markLessonComplete, savePosition, submitAssignment, submitQuiz } from "@/features/academy/application/learning";
import { downloadProduct, PortalError } from "../application/portal";
import { alertAdmin } from "@/features/notifications/application/send";

async function ownAppointment(userId: string, id: string) {
  const a = await db.one<{ id: string }>(
    "select a.id from appointments a join contacts c on c.id = a.contact_id where a.id = $1 and c.user_id = $2", [z.string().uuid().parse(id), userId]);
  if (!a) throw new PortalError("Booking not found.");
  return a.id;
}

export async function cancelMyAppointmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    await cancelAppointment(await ownAppointment(u.id, String(fd.get("id"))), { kind: "customer", userId: u.id }, String(fd.get("reason") || "Cancelled by client").slice(0, 500));
    return undefined;
  });
}

export async function rescheduleMyAppointmentAction(id: string, startsAt: string): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    await rescheduleAppointment(await ownAppointment(u.id, id), z.string().datetime().parse(startsAt), { kind: "customer", userId: u.id });
    return undefined;
  });
}

export async function completeLessonAction(lessonId: string, complete: boolean): Promise<ActionResult<{ courseCompleted: boolean; certificateCode: string | null }>> {
  return runAction(async () => {
    const u = await assertUser();
    return markLessonComplete(u.id, z.string().uuid().parse(lessonId), complete);
  });
}

export async function savePositionAction(lessonId: string, seconds: number): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    await savePosition(u.id, z.string().uuid().parse(lessonId), z.number().int().parse(Math.round(seconds)));
    return undefined;
  });
}

export async function submitQuizAction(lessonId: string, answers: Record<string, string[]>): Promise<ActionResult<{ score: number; passed: boolean; passPercent: number; courseCompleted: boolean; certificateCode: string | null }>> {
  return runAction(async () => {
    const u = await assertUser();
    await rateLimit(`quiz:${u.id}`, 30, 3600);
    return submitQuiz(u.id, z.string().uuid().parse(lessonId), z.record(z.string(), z.array(z.string().max(30)).max(10)).parse(answers));
  });
}

export async function submitAssignmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    await submitAssignment(u.id, z.string().uuid().parse(fd.get("lessonId")), String(fd.get("body") ?? ""));
    return undefined;
  });
}

export async function downloadAction(fd: FormData) {
  const u = await assertUser();
  await rateLimit(`download:${u.id}`, 30, 3600);
  const url = await downloadProduct(u.id, z.string().uuid().parse(fd.get("entitlementId")), await ipHash());
  redirect(url);
}

export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    const i = z.object({
      fullName: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(32).regex(/^[+\d\s()-]*$/).default(""),
      timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    }).parse(Object.fromEntries(fd));
    const prefs = { email: true, sms: fd.get("sms") === "on", marketing: fd.get("marketing") === "on" };
    await db.query("update users set full_name = $2, phone = nullif($3,''), timezone = $4, notification_prefs = $5 where id = $1", [u.id, i.fullName, i.phone, i.timezone, JSON.stringify(prefs)]);
    await db.query("update contacts set full_name = $2, phone = coalesce(nullif($3,''), phone) where user_id = $1", [u.id, i.fullName, i.phone]);
    if (!prefs.marketing) {
      await db.query("update contacts set consent_marketing = false where user_id = $1", [u.id]);
      await db.query("update subscribers set status = 'unsubscribed', unsubscribed_at = now() where email = $1 and status = 'subscribed'", [u.email]);
    }
    return undefined;
  });
}

export async function requestDeletionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    if (fd.get("confirm") !== "DELETE") throw new PortalError('Type DELETE to confirm.');
    await db.query("update users set deletion_requested_at = now() where id = $1", [u.id]);
    await audit({ actorId: u.id, action: "account.deletion_requested", entityType: "user", entityId: u.id });
    await alertAdmin("Account deletion requested", `${u.email} asked for their account and personal data to be deleted. Financial records must be retained; anonymise the contact from the CRM.`, `deletion:${u.id}`);
    return undefined;
  });
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertUser();
    await rateLimit(`pwchange:${u.id}`, 5, 3600);
    await authProvider().requestPasswordReset(u.email);
    return undefined;
  });
}
