"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { invalidate } from "@/lib/cache";
import { db } from "@/lib/database/pool";
import { fromLocalInput } from "@/lib/time";
import { slugify } from "@/lib/slug";
import { loadSetting } from "@/features/settings/application/settings";
import { ArticleError, saveArticle, setArticleStatus } from "../application/articles";

export async function saveArticleAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const u = await assertPermission("content:edit");
    const saved = await saveArticle(id ? z.string().uuid().parse(id) : null, input, u.id);
    invalidate("articles");
    return { id: saved };
  });
}

export async function articleStatusAction(id: string, action: "publish" | "unpublish" | "archive" | "schedule", whenLocal?: string): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("content:publish");
    let when: Date | undefined;
    if (action === "schedule") {
      when = fromLocalInput(whenLocal, (await loadSetting("business")).timezone) ?? undefined;
      if (!when) throw new ArticleError("Choose a publish time.");
    }
    await setArticleStatus(z.string().uuid().parse(id), action, u.id, when);
    invalidate("articles", "pages");
    return undefined;
  });
}

export async function categoryAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("content:edit");
    const name = z.string().trim().min(2).max(60).parse(fd.get("name"));
    await db.query("insert into content_categories (name, slug) values ($1,$2) on conflict (slug) do nothing", [name, slugify(name)]);
    return undefined;
  });
}

export async function restoreArticleRevisionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("content:edit");
    const rev = await db.one<{ article_id: string; title: string; body: unknown }>("select * from article_revisions where id = $1", [z.string().uuid().parse(fd.get("revisionId"))]);
    if (!rev) throw new ArticleError("Revision not found.");
    await db.query("update articles set title = $2, body = $3 where id = $1", [rev.article_id, rev.title, JSON.stringify(rev.body)]);
    invalidate("articles");
    return undefined;
  });
}

const calendarItem = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).default(""),
  title: z.string().trim().min(1).max(250),
  channel: z.enum(["linkedin", "article", "newsletter", "campaign", "instagram", "video", "other"]),
  status: z.enum(["idea", "drafting", "ready", "published", "skipped"]).default("idea"),
  plannedFor: z.string(),
  reminderAt: z.string().optional().default(""),
  body: z.string().max(10000).default(""),
});

export async function calendarItemAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const u = await assertPermission("content:edit");
    const i = calendarItem.parse(Object.fromEntries(fd));
    const tz = (await loadSetting("business")).timezone;
    const planned = fromLocalInput(i.plannedFor, tz);
    if (!planned) throw new ArticleError("Choose when this is planned.");
    const reminder = fromLocalInput(i.reminderAt, tz);
    if (i.id) {
      await db.query(
        `update content_calendar_items set title=$2, channel=$3, status=$4, planned_for=$5, reminder_at=$6, body=$7,
           reminder_sent_at = case when reminder_at is distinct from $6 then null else reminder_sent_at end where id=$1`,
        [i.id, i.title, i.channel, i.status, planned, reminder, i.body],
      );
    } else {
      await db.query(
        "insert into content_calendar_items (title, channel, status, planned_for, reminder_at, body, created_by) values ($1,$2,$3,$4,$5,$6,$7)",
        [i.title, i.channel, i.status, planned, reminder, i.body, u.id],
      );
    }
    return undefined;
  });
}

export async function deleteCalendarItemAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPermission("content:edit");
    await db.query("delete from content_calendar_items where id = $1", [z.string().uuid().parse(fd.get("id"))]);
    return undefined;
  });
}
