"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import { fromLocalInput } from "@/lib/time";
import { loadSetting } from "@/features/settings/application/settings";
import {
  addResource, addSessions, cancelEvent, checkIn, deleteTicket, duplicateEvent, EventAdminError, issueEventCertificates,
  manualRegistration, rescheduleEvent, saveAccess, saveEvent, saveTicket, setEventStatus,
} from "../application/admin";
import { db } from "@/lib/database/pool";

const on = (fd: FormData, k: string) => fd.get(k) === "on";
async function dt(fd: FormData, k: string, tzOverride?: string) {
  const tz = tzOverride || (await loadSetting("business")).timezone;
  return fromLocalInput(String(fd.get(k) ?? ""), tz);
}
const done = () => invalidate("events", "pages");

export async function saveEventAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const tz = String(fd.get("timezone") || (await loadSetting("business")).timezone);
    const startsAt = await dt(fd, "startsAt", tz);
    const endsAt = await dt(fd, "endsAt", tz);
    if (!startsAt || !endsAt) throw new EventAdminError("Enter a start and end time.");
    const id = await saveEvent(String(fd.get("id") || "") || null, {
      ...Object.fromEntries(fd), timezone: tz, startsAt, endsAt,
      registrationOpensAt: await dt(fd, "registrationOpensAt", tz), registrationClosesAt: await dt(fd, "registrationClosesAt", tz),
      waitlistEnabled: on(fd, "waitlistEnabled"), certificateEnabled: on(fd, "certificateEnabled"), feedbackEnabled: on(fd, "feedbackEnabled"),
    }, u.id);
    done();
    return { redirect: `/admin/events/${id}` };
  });
}

export async function eventStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await setEventStatus(z.string().uuid().parse(fd.get("id")), z.enum(["publish", "unpublish"]).parse(fd.get("op")), u.id);
    done();
    return undefined;
  });
}

export async function saveTicketAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const tz = String(fd.get("timezone") || "");
    await saveTicket({ ...Object.fromEntries(fd), salesStartAt: await dt(fd, "salesStartAt", tz), salesEndAt: await dt(fd, "salesEndAt", tz) }, u.id);
    done();
    return undefined;
  });
}

export async function deleteTicketAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await deleteTicket(z.string().uuid().parse(fd.get("id")), u.id);
    done();
    return undefined;
  });
}

export async function saveAccessAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await saveAccess(z.string().uuid().parse(fd.get("eventId")), {
      provider: z.enum(["manual", "zoom", "google_meet"]).parse(fd.get("provider")),
      url: String(fd.get("url") ?? "").trim(), meetingId: String(fd.get("meetingId") ?? ""), passcode: String(fd.get("passcode") ?? ""),
      instructions: String(fd.get("instructions") ?? "").slice(0, 3000), opensMinutesBefore: z.coerce.number().int().min(0).max(1440).parse(fd.get("opensMinutesBefore") || 30),
    }, u.id);
    return undefined;
  });
}

export async function addSessionsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const startsAt = await dt(fd, "startsAt");
    if (!startsAt) throw new EventAdminError("Choose a start time.");
    await addSessions(z.string().uuid().parse(fd.get("eventId")), {
      title: String(fd.get("title") ?? ""), startsAt,
      durationMinutes: z.coerce.number().int().min(10).max(1440).parse(fd.get("durationMinutes")),
      repeatWeeks: z.coerce.number().int().min(1).max(52).parse(fd.get("repeatWeeks") || 1),
    }, u.id);
    done();
    return undefined;
  });
}

export async function deleteSessionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("events:manage");
    await db.query("delete from event_sessions where id = $1", [z.string().uuid().parse(fd.get("id"))]);
    done();
    return undefined;
  });
}

export async function addResourceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await addResource(z.string().uuid().parse(fd.get("eventId")), {
      kind: z.enum(["recording", "slides", "download", "link"]).parse(fd.get("kind")), title: String(fd.get("title") ?? "").slice(0, 200),
      mediaId: String(fd.get("mediaId") ?? ""), url: String(fd.get("url") ?? "").trim(), availableFrom: await dt(fd, "availableFrom"),
    }, u.id);
    return undefined;
  });
}

export async function deleteResourceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("events:manage");
    await db.query("delete from event_resources where id = $1", [z.string().uuid().parse(fd.get("id"))]);
    return undefined;
  });
}

export async function duplicateEventAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const id = await duplicateEvent(z.string().uuid().parse(fd.get("id")), u.id);
    return { redirect: `/admin/events/${id}` };
  });
}

export async function rescheduleEventAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const tz = String(fd.get("timezone") || "");
    const s = await dt(fd, "startsAt", tz), e = await dt(fd, "endsAt", tz);
    if (!s || !e) throw new EventAdminError("Enter the new start and end.");
    await rescheduleEvent(z.string().uuid().parse(fd.get("id")), s, e, u.id);
    done();
    return undefined;
  });
}

export async function cancelEventAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await cancelEvent(z.string().uuid().parse(fd.get("id")), String(fd.get("reason") ?? ""), u.id);
    done();
    return undefined;
  });
}

export async function manualRegistrationAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const i = z.object({ eventId: z.string().uuid(), ticketTypeId: z.string().uuid(), fullName: z.string().trim().min(1).max(150), email: z.string().trim().toLowerCase().email(), source: z.enum(["manual", "complimentary"]), note: z.string().max(1000).default("") }).parse(Object.fromEntries(fd));
    await manualRegistration(i, u.id);
    done();
    return undefined;
  });
}

export async function checkInAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await checkIn(z.string().uuid().parse(fd.get("id")), fd.get("attended") === "1", u.id);
    return undefined;
  });
}

export async function certificatesAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    const n = await issueEventCertificates(z.string().uuid().parse(fd.get("id")), u.id);
    if (n === 0) throw new EventAdminError("No new certificates: mark attendance first (already-issued certificates are not duplicated).");
    return undefined;
  });
}
