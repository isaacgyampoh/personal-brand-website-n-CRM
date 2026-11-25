"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import { fromLocalInput } from "@/lib/time";
import { loadSetting, saveSetting } from "@/features/settings/application/settings";
import { createPage, publishPage, restoreRevision, saveDraft, schedulePublish, unpublishPage, PageError } from "../application/pages";
import { db } from "@/lib/database/pool";
import type { SettingKey } from "@/features/settings/domain/schemas";

export async function saveDraftAction(pageId: string, content: unknown, seo: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("website:edit");
    await saveDraft(z.string().uuid().parse(pageId), content, seo, u.id);
    return undefined;
  });
}

export async function publishPageAction(pageId: string, content: unknown, seo: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("website:publish");
    const id = z.string().uuid().parse(pageId);
    await saveDraft(id, content, seo, u.id);
    await publishPage(id, u.id);
    invalidate("pages");
    return undefined;
  });
}

export async function schedulePageAction(pageId: string, content: unknown, seo: unknown, whenLocal: string): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("website:publish");
    const id = z.string().uuid().parse(pageId);
    const when = fromLocalInput(whenLocal, (await loadSetting("business")).timezone);
    if (!when) throw new PageError("Choose a date and time.");
    await saveDraft(id, content, seo, u.id);
    await schedulePublish(id, when, u.id);
    return undefined;
  });
}

export async function pageLifecycleAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const op = z.enum(["create", "unpublish", "restore", "delete"]).parse(fd.get("op"));
    if (op === "create") {
      const u = await assertPermission("website:edit");
      const id = await createPage({ title: z.string().trim().min(1).max(200).parse(fd.get("title")), slug: String(fd.get("slug") ?? ""), kind: z.enum(["standard", "landing", "legal"]).parse(fd.get("kind")), actorId: u.id });
      return { redirect: `/studio/${id}` };
    }
    const u = await assertPermission("website:publish");
    const pageId = z.string().uuid().parse(fd.get("pageId"));
    if (op === "unpublish") await unpublishPage(pageId, u.id);
    if (op === "restore") await restoreRevision(pageId, z.string().uuid().parse(fd.get("revisionId")), u.id);
    if (op === "delete") {
      const p = await db.one<{ kind: string; status: string }>("select kind, status from pages where id = $1", [pageId]);
      if (!p || p.kind === "home" || p.kind === "legal") throw new PageError("This page can't be deleted.");
      await db.query("delete from pages where id = $1", [pageId]);
    }
    invalidate("pages");
    return { redirect: op === "delete" ? "/admin/website" : `/admin/website/${pageId}` };
  });
}

/** Saves a settings section from a form. Nested fields use JSON in a hidden `json` input. */
export async function saveSettingsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const key = z.enum(["brand", "theme", "contact", "social", "business", "commerce", "seo", "navigation", "announcement", "links", "email", "features", "onboarding"]).parse(fd.get("key")) as SettingKey;
    const permission = ["navigation", "announcement", "links", "theme", "brand", "seo"].includes(key) ? "website:edit" : "settings:manage";
    const u = await assertPermission(permission);
    const raw = fd.get("json")
      ? JSON.parse(String(fd.get("json")))
      : Object.fromEntries([...fd.entries()].filter(([k]) => k !== "key" && !k.startsWith("$")).map(([k, v]) => [k, v === "on" ? true : v === "off" ? false : v]));
    // unchecked checkboxes are absent from FormData: mark known booleans false
    for (const b of String(fd.get("$booleans") ?? "").split(",").filter(Boolean)) if (!(b in raw)) raw[b] = false;
    await saveSetting(key, raw, u.id);
    invalidate("settings", "pages");
    return undefined;
  });
}
