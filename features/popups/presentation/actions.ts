"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import { fromLocalInput } from "@/lib/time";
import { loadSetting } from "@/features/settings/application/settings";
import { popupInput, type PublicPopup } from "../domain/popups";
import { buildPopup, deletePopup, savePopup, setEventPopup, setPopupStatus, type PopupRow } from "../application/popups";

const id = z.string().uuid();

export async function savePopupAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("website:edit");
    const tz = (await loadSetting("business")).timezone;
    const v = popupInput.parse(Object.fromEntries(fd));
    const popupId = await savePopup(String(fd.get("id") || "") || null, {
      ...v, startsAt: fromLocalInput(String(fd.get("startsAt") ?? ""), tz), endsAt: fromLocalInput(String(fd.get("endsAt") ?? ""), tz),
    }, u.id);
    invalidate("popups");
    return { redirect: `/admin/website/popups/${popupId}` };
  });
}

export async function popupStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("website:edit");
    await setPopupStatus(id.parse(fd.get("id")), z.enum(["active", "paused"]).parse(fd.get("status")), u.id);
    invalidate("popups");
    return undefined;
  });
}

export async function deletePopupAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    const u = await assertPermission("website:edit");
    await deletePopup(id.parse(fd.get("id")), u.id);
    invalidate("popups");
    return { redirect: "/admin/website/popups" };
  });
}

/** Event page switch: "Promote with a website pop-up". */
export async function eventPopupAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("events:manage");
    await setEventPopup(id.parse(fd.get("eventId")), fd.get("on") === "1", u.id);
    invalidate("popups");
    return undefined;
  });
}

/**
 * Live preview in the editor: builds the pop-up from the unsaved form exactly as
 * the website would (real event data, flyer, price, seats). Never saved.
 */
export async function previewPopupAction(values: Record<string, string>): Promise<{ popup: PublicPopup | null; note: string | null }> {
  await assertPermission("website:edit");
  const parsed = popupInput.safeParse(values);
  const v = parsed.success ? parsed.data : null;
  const row: PopupRow = {
    id: "00000000-0000-4000-8000-000000000000", name: values.name ?? "", kind: (v?.kind ?? values.kind ?? "custom") as PopupRow["kind"],
    event_id: (v?.eventId || values.eventId) || null, layout: (v?.layout ?? values.layout ?? "editorial") as PopupRow["layout"],
    eyebrow: values.eyebrow ?? "", heading: values.heading ?? "", body: values.body ?? "", button_text: values.buttonText ?? "",
    destination: values.destination ?? "", image_media_id: z.string().uuid().safeParse(values.imageMediaId).success ? values.imageMediaId : null,
    colors: Object.fromEntries(([["accent", values.accent], ["background", values.background], ["text", values.text]] as const).filter(([, c]) => /^#[0-9a-f]{6}$/i.test(c ?? ""))),
    pages: "all", page_paths: [], devices: "all", delay_seconds: 0, frequency: "session", dismiss_days: 0, priority: 0,
    starts_at: null, ends_at: null, status: "draft", created_at: new Date(), updated_at: new Date(),
  };
  if (row.kind === "event" && !row.event_id) return { popup: null, note: "Choose an event to preview it." };
  const popup = await buildPopup(row, { preview: true }).catch(() => null);
  if (!popup) return { popup: null, note: "Add a heading to see the preview." };
  // Would the live website show it right now? (event lifecycle: published, registration open, seats or waiting list)
  const live = row.kind === "event" ? await buildPopup(row).catch(() => null) : popup;
  const note = live ? null : "Hidden on the website right now — the event is unpublished, cancelled or finished, registration is closed or not yet open, or it is sold out without a waiting list.";
  return { popup, note };
}
