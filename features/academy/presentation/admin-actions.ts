"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import {
  addLessonResource, deleteLesson, deleteModule, manualEnrol, moveItem, reviewAssignment, saveCourse, saveLesson, saveModule, saveProduct,
  saveQuiz, setCourseStatus, setProductStatus,
} from "../application/admin";

const on = (fd: FormData, k: string) => fd.get(k) === "on";

export async function saveCourseAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("courses:manage");
    const id = await saveCourse(String(fd.get("id") || "") || null, { ...Object.fromEntries(fd), certificateEnabled: on(fd, "certificateEnabled"), requireQuizzesPassed: on(fd, "requireQuizzesPassed") }, u.id);
    invalidate("courses", "pages");
    return { redirect: `/admin/academy/${id}` };
  });
}

export async function courseStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("courses:manage");
    await setCourseStatus(z.string().uuid().parse(fd.get("id")), z.enum(["published", "draft", "archived"]).parse(fd.get("status")), u.id);
    invalidate("courses", "pages");
    return undefined;
  });
}

export async function moduleAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("courses:manage");
    const op = String(fd.get("op") ?? "save");
    if (op === "delete") await deleteModule(z.string().uuid().parse(fd.get("id")));
    else if (op === "up" || op === "down") await moveItem("course_modules", z.string().uuid().parse(fd.get("id")), op === "up" ? -1 : 1);
    else await saveModule(z.string().uuid().parse(fd.get("courseId")), {
      id: String(fd.get("id") || "") || undefined, title: z.string().trim().min(1).max(200).parse(fd.get("title")),
      releaseAfterDays: fd.get("releaseAfterDays") ? z.coerce.number().int().min(0).parse(fd.get("releaseAfterDays")) : null,
    });
    invalidate("courses");
    return undefined;
  });
}

export async function lessonMoveAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("courses:manage");
    const op = String(fd.get("op"));
    const id = z.string().uuid().parse(fd.get("id"));
    if (op === "delete") await deleteLesson(id);
    else await moveItem("lessons", id, op === "up" ? -1 : 1);
    invalidate("courses");
    return undefined;
  });
}

export async function saveLessonAction(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const u = await assertPermission("courses:manage");
    const id = await saveLesson(input, u.id);
    invalidate("courses");
    return { id };
  });
}

export async function saveQuizAction(lessonId: string, input: { passPercent: number; maxAttempts: number | null; questions: unknown }): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("courses:manage");
    await saveQuiz(z.string().uuid().parse(lessonId), { passPercent: z.number().int().min(1).max(100).parse(input.passPercent), maxAttempts: input.maxAttempts, questions: input.questions });
    return undefined;
  });
}

export async function lessonResourceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("courses:manage");
    await addLessonResource(z.string().uuid().parse(fd.get("lessonId")), z.string().uuid().parse(fd.get("mediaId")), z.string().trim().min(1).max(200).parse(fd.get("title")));
    return undefined;
  });
}

export async function manualEnrolAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("courses:manage");
    await manualEnrol(z.string().uuid().parse(fd.get("courseId")), z.string().trim().toLowerCase().email().parse(fd.get("email")), String(fd.get("fullName") ?? ""), u.id);
    return undefined;
  });
}

export async function reviewAssignmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("courses:manage");
    await reviewAssignment(z.string().uuid().parse(fd.get("id")), z.enum(["reviewed", "needs_revision"]).parse(fd.get("status")), String(fd.get("feedback") ?? ""), u.id);
    return undefined;
  });
}

export async function saveProductAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("products:manage");
    const id = await saveProduct(String(fd.get("id") || "") || null, { ...Object.fromEntries(fd), isLeadMagnet: on(fd, "isLeadMagnet") }, u.id);
    invalidate("products", "pages");
    return { redirect: `/admin/shop/${id}` };
  });
}

export async function productStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("products:manage");
    await setProductStatus(z.string().uuid().parse(fd.get("id")), z.enum(["published", "draft", "archived"]).parse(fd.get("status")), u.id);
    invalidate("products", "pages");
    return undefined;
  });
}
