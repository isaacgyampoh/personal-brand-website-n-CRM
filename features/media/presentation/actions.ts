"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { UserError } from "@/lib/errors";
import { CROP_ASPECTS, cropMedia, deleteMedia, setFocalPoint, type CropAspect } from "../application/media";

export async function deleteMediaAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("media:manage");
    const r = await deleteMedia(z.string().uuid().parse(fd.get("id")), u.id);
    if (!r.ok) throw new UserError(`Still in use by: ${r.references.join(", ")}. Remove it there first.`);
    return undefined;
  });
}

export async function updateMediaAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("media:manage");
    const i = z.object({ id: z.string().uuid(), altText: z.string().max(500).default(""), category: z.string().trim().max(40).default("general") }).parse(Object.fromEntries(fd));
    await db.query("update media_assets set alt_text = $2, category = $3 where id = $1", [i.id, i.altText, i.category || "general"]);
    return undefined;
  });
}

export async function focalPointAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("media:manage");
    const i = z.object({ id: z.string().uuid(), x: z.coerce.number().min(0).max(1), y: z.coerce.number().min(0).max(1) }).parse(Object.fromEntries(fd));
    await setFocalPoint(i.id, i.x, i.y, u.id);
    return undefined;
  });
}

export async function cropMediaAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("media:manage");
    const id = z.string().uuid().parse(fd.get("id"));
    const aspect = z.enum(Object.keys(CROP_ASPECTS) as [CropAspect, ...CropAspect[]]).parse(fd.get("aspect"));
    await cropMedia(id, aspect, u.id);
    return undefined;
  });
}
