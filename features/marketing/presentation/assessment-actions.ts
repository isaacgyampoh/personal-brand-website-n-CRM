"use server";

import { z } from "zod";
import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/database/pool";
import { slugify } from "@/lib/slug";
import { UserError } from "@/lib/errors";
import { assessmentDefinitionSchema } from "../domain/assessment";
import { DEMO_ASSESSMENT } from "../application/assessments";

export async function saveAssessmentAction(_: unknown, fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    const id = String(fd.get("id") || "");
    const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
    let def;
    try {
      def = assessmentDefinitionSchema.parse(JSON.parse(String(fd.get("definition") || "{}")));
    } catch (e) {
      throw new UserError(`The questions definition is invalid: ${(e as Error).message.slice(0, 300)}`);
    }
    const status = z.enum(["draft", "published", "archived"]).parse(fd.get("status") || "draft");
    const vals = [slugify(String(fd.get("slug") || title)), title, String(fd.get("intro") ?? "").slice(0, 2000), JSON.stringify(def), status];
    const saved = id
      ? (await db.one<{ id: string }>("update assessments set slug=$1, title=$2, intro=$3, definition=$4, status=$5 where id=$6 returning id", [...vals, id]))!.id
      : (await db.one<{ id: string }>("insert into assessments (slug, title, intro, definition, status) values ($1,$2,$3,$4,$5) returning id", vals))!.id;
    return { redirect: `/admin/assessments/${saved}` };
  });
}

export async function createStarterAssessmentAction(): Promise<ActionResult<{ redirect: string }>> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    const r = await db.one<{ id: string }>(
      `insert into assessments (slug, title, intro, definition, status) values ('personal-brand-assessment', 'Personal Brand Assessment', 'Six questions. Two minutes. A clear picture of where your brand stands.', $1, 'draft')
       on conflict (slug) do update set slug = excluded.slug returning id`, [JSON.stringify(DEMO_ASSESSMENT)]);
    return { redirect: `/admin/assessments/${r!.id}` };
  });
}
