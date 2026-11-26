"use server";

import { requestTestimonial } from "../application/testimonials";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import {
  addNote, createContact, deleteContact, mergeContacts, saveTask, setStage, setTags, setTaskStatus, updateContact,
} from "../application/admin";
import { importContacts, type ImportReport } from "../application/import";
import { contactFilterSchema } from "../domain/segments";

import { loadSetting } from "@/features/settings/application/settings";
import { fromLocalInput } from "@/lib/time";

async function fdContact(fd: FormData) {
  const tz = (await loadSetting("business")).timezone;
  const follow = fromLocalInput(String(fd.get("nextFollowUpAt") ?? ""), tz);
  return { ...Object.fromEntries(fd), nextFollowUpAt: follow ? follow.toISOString() : "", consentMarketing: fd.get("consentMarketing") === "on" };
}

export async function createContactAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    const id = await createContact(await fdContact(fd), u.id);
    return { redirect: `/admin/crm/${id}` };
  });
}

export async function updateContactAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    await updateContact(z.string().uuid().parse(fd.get("id")), await fdContact(fd), u.id);
    return undefined;
  });
}

export async function noteAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    const i = z.object({ contactId: z.string().uuid(), kind: z.enum(["note", "call", "meeting", "email"]), title: z.string().max(200).default(""), body: z.string().trim().min(1, "Write something").max(10000) }).parse(Object.fromEntries(fd));
    await addNote(i.contactId, i.kind, i.title, i.body, u.id);
    return undefined;
  });
}

export async function tagsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    await setTags(z.string().uuid().parse(fd.get("contactId")), String(fd.get("tags") ?? "").split(","), u.id);
    return undefined;
  });
}

export async function stageAction(contactId: string, stageId: string): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    await setStage(z.string().uuid().parse(contactId), z.string().uuid().parse(stageId), u.id);
    return undefined;
  });
}

export async function mergeAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    const target = z.string().uuid().parse(fd.get("targetId"));
    await mergeContacts(target, z.string().uuid().parse(fd.get("sourceId")), u.id);
    return { redirect: `/admin/crm/${target}` };
  });
}

export async function deleteContactAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    await deleteContact(z.string().uuid().parse(fd.get("id")), u.id);
    return { redirect: "/admin/crm" };
  });
}

export async function taskAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    const i = z.object({ id: z.string().uuid().optional().or(z.literal("")), title: z.string(), notes: z.string().optional(), contactId: z.string().optional(), dueAt: z.string().optional(), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal") }).parse(Object.fromEntries(fd));
    const tz = (await loadSetting("business")).timezone;
    const due = fromLocalInput(i.dueAt, tz);
    await saveTask({ ...i, id: i.id || undefined, dueAt: due ? due.toISOString() : "" }, u.id);
    return undefined;
  });
}

export async function taskStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("crm:edit");
    await setTaskStatus(z.string().uuid().parse(fd.get("id")), z.enum(["open", "done", "cancelled"]).parse(fd.get("status")));
    return undefined;
  });
}

export async function importAction(_: unknown, fd: FormData): Promise<ActionResult<ImportReport>> {
  return runAction(async () => {
    const u = await assertPermission("crm:import");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new (await import("../application/admin")).CrmError("Choose a file to import.");
    const report = await importContacts(file, { confirmConsent: fd.get("confirmConsent") === "on", tag: String(fd.get("tag") ?? "") }, u.id);
    return report;
  });
}

export async function saveSegmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("crm:edit");
    const name = z.string().trim().min(2).max(80).parse(fd.get("name"));
    const filter = contactFilterSchema.parse(JSON.parse(String(fd.get("filter") ?? "{}")));
    await db.query("insert into segments (name, filter) values ($1,$2) on conflict (name) do update set filter = excluded.filter", [name, JSON.stringify(filter)]);
    return undefined;
  });
}

export async function requestTestimonialAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("crm:edit");
    await requestTestimonial(z.string().uuid().parse(fd.get("id")), u.id);
    return undefined;
  });
}
