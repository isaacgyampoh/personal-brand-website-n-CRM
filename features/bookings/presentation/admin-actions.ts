"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import { fromLocalInput } from "@/lib/time";
import { loadSetting } from "@/features/settings/application/settings";
import { addException, saveService, saveWeeklyHours, updateAppointmentAdmin, ServiceAdminError } from "../application/admin";
import { adminCreateAppointment, cancelAppointment, rescheduleAppointment } from "../application/booking";
import { db } from "@/lib/database/pool";

const bool = (fd: FormData, k: string) => fd.get(k) === "on";
const tz = async () => (await loadSetting("business")).timezone;

export async function saveServiceAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    const id = String(fd.get("id") ?? "") || null;
    const saved = await saveService(id, { ...Object.fromEntries(fd), refundOnCancel: bool(fd, "refundOnCancel"), isActive: bool(fd, "isActive"), featured: bool(fd, "featured") }, u.id);
    invalidate("services", "pages");
    return { redirect: `/admin/services/${saved}` };
  });
}

export async function saveHoursAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    const serviceId = String(fd.get("serviceId") ?? "") || null;
    const rows: { weekday: number; start: string; end: string }[] = [];
    for (let d = 0; d < 7; d++) {
      if (fd.get(`on-${d}`) !== "on") continue;
      const starts = fd.getAll(`start-${d}`).map(String);
      const ends = fd.getAll(`end-${d}`).map(String);
      starts.forEach((s, i) => s && ends[i] && rows.push({ weekday: d, start: s, end: ends[i] }));
    }
    if (serviceId && fd.get("useGlobal") === "on") {
      await db.query("delete from availability_rules where service_id = $1", [serviceId]);
      return undefined;
    }
    await saveWeeklyHours(serviceId, rows, u.id);
    return undefined;
  });
}

export async function addExceptionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    const zone = await tz();
    const startsAt = fromLocalInput(String(fd.get("startsAt")), zone);
    const endsAt = fromLocalInput(String(fd.get("endsAt")), zone);
    if (!startsAt || !endsAt) throw new ServiceAdminError("Enter a start and end.");
    await addException({
      serviceId: String(fd.get("serviceId") ?? "") || null,
      kind: z.enum(["blocked", "holiday", "extra_hours"]).parse(fd.get("kind")),
      startsAt, endsAt, reason: String(fd.get("reason") ?? ""),
    }, u.id);
    return undefined;
  });
}

export async function deleteExceptionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("bookings:manage");
    await db.query("delete from availability_exceptions where id = $1", [z.string().uuid().parse(fd.get("id"))]);
    return undefined;
  });
}

export async function adminCreateAppointmentAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    const start = fromLocalInput(String(fd.get("startsAt")), await tz());
    if (!start) throw new ServiceAdminError("Choose a start time.");
    const i = z.object({ serviceId: z.string().uuid(), email: z.string().trim().toLowerCase().email(), fullName: z.string().trim().min(1).max(150), phone: z.string().max(32).optional(), notes: z.string().max(2000).optional(), meetingUrl: z.string().optional() }).parse(Object.fromEntries(fd));
    const id = await adminCreateAppointment({ ...i, startsAt: start.toISOString(), actorId: u.id, override: bool(fd, "override") });
    return { redirect: `/admin/bookings/${id}` };
  });
}

export async function adminCancelAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    await cancelAppointment(z.string().uuid().parse(fd.get("id")), { kind: "admin", userId: u.id, override: true }, String(fd.get("reason") || "Cancelled by business"));
    return undefined;
  });
}

export async function adminRescheduleAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    const start = fromLocalInput(String(fd.get("startsAt")), await tz());
    if (!start) throw new ServiceAdminError("Choose a new time.");
    await rescheduleAppointment(z.string().uuid().parse(fd.get("id")), start.toISOString(), { kind: "admin", userId: u.id, override: bool(fd, "override") });
    return undefined;
  });
}

export async function updateAppointmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("bookings:manage");
    const status = fd.get("status") ? z.enum(["completed", "no_show"]).parse(fd.get("status")) : undefined;
    await updateAppointmentAdmin(z.string().uuid().parse(fd.get("id")), {
      status,
      meetingUrl: fd.has("meetingUrl") ? String(fd.get("meetingUrl")) : undefined,
      meetingDetails: fd.has("meetingDetails") ? String(fd.get("meetingDetails")) : undefined,
      internalNotes: fd.has("internalNotes") ? String(fd.get("internalNotes")) : undefined,
    }, u.id);
    return undefined;
  });
}
