import "server-only";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { parseMajorToMinor } from "@/lib/money";
import { docFromText, isRichDoc } from "@/features/content/domain/rich-text";
import { upsertContact, logActivity } from "@/features/crm/application/contacts";
import { grantEntitlement } from "@/features/commerce/application/entitlements";
import { enqueueEmail } from "@/features/notifications/application/send";
import { env } from "@/lib/config/env";
import { AcademyError, quizQuestionSchema } from "./learning";

const doc = (v: string) => { try { const j = JSON.parse(v); return isRichDoc(j) ? j : docFromText(v); } catch { return docFromText(v); } };

export const courseInput = z.object({
  title: z.string().trim().min(1).max(200), slug: z.string().trim().max(100).default(""), subtitle: z.string().max(250).default(""),
  summary: z.string().max(600).default(""), description: z.string().max(30000).default(""), coverMediaId: z.union([z.literal(""), z.string().uuid()]).default(""),
  category: z.string().trim().max(60).default("general"), level: z.enum(["beginner", "intermediate", "advanced", "all"]).default("all"),
  price: z.string().default("0"), currency: z.string().length(3).default("GHS"), visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  certificateEnabled: z.boolean(), completionPercent: z.coerce.number().int().min(1).max(100).default(100), requireQuizzesPassed: z.boolean(),
  outcomes: z.string().max(3000).default(""), seoTitle: z.string().max(80).default(""), seoDescription: z.string().max(300).default(""),
});

export async function saveCourse(id: string | null, raw: unknown, actorId: string): Promise<string> {
  const i = courseInput.parse(raw);
  const vals = [slugify(i.slug || i.title), i.title, i.subtitle, i.summary, JSON.stringify(doc(i.description)), i.coverMediaId || null, i.category, i.level,
    parseMajorToMinor(i.price || "0", i.currency), i.currency.toUpperCase(), i.visibility, i.certificateEnabled, i.completionPercent, i.requireQuizzesPassed,
    i.outcomes.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12), JSON.stringify({ title: i.seoTitle, description: i.seoDescription })];
  try {
    if (id) {
      await db.query(
        `update courses set slug=$1,title=$2,subtitle=$3,summary=$4,description=$5,cover_media_id=$6,category=$7,level=$8,price_minor=$9,currency=$10,
           visibility=$11,certificate_enabled=$12,completion_percent=$13,require_quizzes_passed=$14,outcomes=$15,seo=$16 where id=$17`, [...vals, id]);
    } else {
      id = (await db.one<{ id: string }>(
        `insert into courses (slug,title,subtitle,summary,description,cover_media_id,category,level,price_minor,currency,visibility,certificate_enabled,completion_percent,require_quizzes_passed,outcomes,seo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`, vals))!.id;
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new AcademyError("Another course uses that URL slug.");
    throw e;
  }
  await audit({ actorId, action: "course.save", entityType: "course", entityId: id });
  return id!;
}

export async function setCourseStatus(id: string, status: "published" | "draft" | "archived", actorId: string) {
  if (status === "published") {
    const n = await db.one<{ n: number }>("select count(*)::int as n from lessons where course_id = $1", [id]);
    if (!n?.n) throw new AcademyError("Add at least one lesson before publishing.");
  }
  await db.query("update courses set status = $2, published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end where id = $1", [id, status]);
  await audit({ actorId, action: `course.${status}`, entityType: "course", entityId: id });
}

export async function saveModule(courseId: string, input: { id?: string; title: string; releaseAfterDays: number | null }) {
  if (input.id) await db.query("update course_modules set title = $2, release_after_days = $3 where id = $1 and course_id = $4", [input.id, input.title, input.releaseAfterDays, courseId]);
  else await db.query("insert into course_modules (course_id, title, position, release_after_days) values ($1,$2,(select coalesce(max(position),-1)+1 from course_modules where course_id = $1),$3)", [courseId, input.title, input.releaseAfterDays]);
}

export async function moveItem(table: "course_modules" | "lessons", id: string, dir: -1 | 1) {
  await tx(async (t) => {
    const row = await t.one<{ position: number; scope: string }>(
      table === "course_modules" ? "select position, course_id::text as scope from course_modules where id = $1" : "select position, module_id::text as scope from lessons where id = $1", [id]);
    if (!row) return;
    const scopeCol = table === "course_modules" ? "course_id" : "module_id";
    const other = await t.one<{ id: string; position: number }>(
      `select id, position from ${table} where ${scopeCol} = $1 and position ${dir < 0 ? "<" : ">"} $2 order by position ${dir < 0 ? "desc" : "asc"} limit 1`, [row.scope, row.position]);
    if (!other) return;
    await t.query(`update ${table} set position = $2 where id = $1`, [id, other.position]);
    await t.query(`update ${table} set position = $2 where id = $1`, [other.id, row.position]);
  });
}

export async function deleteModule(id: string) {
  const used = await db.one("select 1 from lesson_progress p join lessons l on l.id = p.lesson_id where l.module_id = $1 limit 1", [id]);
  if (used) throw new AcademyError("Students have progress in this module. Rename it or move lessons instead of deleting.");
  await db.query("delete from course_modules where id = $1", [id]);
}

export const lessonInput = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).default(""), courseId: z.string().uuid(), moduleId: z.string().uuid(),
  title: z.string().trim().min(1).max(200), kind: z.enum(["video", "text", "audio", "download", "quiz", "assignment"]),
  body: z.unknown(), videoProvider: z.union([z.literal(""), z.enum(["r2", "youtube_unlisted", "vimeo"])]).default(""), videoRef: z.string().max(200).default(""),
  mediaId: z.union([z.literal(""), z.string().uuid()]).default(""), durationMinutes: z.coerce.number().min(0).max(600).default(0),
  isPreview: z.boolean(), releaseAfterDays: z.union([z.literal(""), z.coerce.number().int().min(0).max(3650)]).default(""),
});

export async function saveLesson(raw: unknown, actorId: string): Promise<string> {
  const i = lessonInput.parse(raw);
  const body = isRichDoc(i.body) ? i.body : { type: "doc", content: [] };
  const vals = [i.moduleId, i.title, i.kind, JSON.stringify(body), i.videoProvider || null, i.videoRef || null, i.mediaId || null,
    i.durationMinutes ? Math.round(i.durationMinutes * 60) : null, i.isPreview, i.releaseAfterDays === "" ? null : i.releaseAfterDays];
  let id = i.id;
  if (id) await db.query(`update lessons set module_id=$1,title=$2,kind=$3,body=$4,video_provider=$5,video_ref=$6,media_id=$7,duration_seconds=$8,is_preview=$9,release_after_days=$10 where id=$11 and course_id=$12`, [...vals, id, i.courseId]);
  else id = (await db.one<{ id: string }>(
    `insert into lessons (module_id,title,kind,body,video_provider,video_ref,media_id,duration_seconds,is_preview,release_after_days,course_id,position)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,(select coalesce(max(position),-1)+1 from lessons where module_id = $1)) returning id`, [...vals, i.courseId]))!.id;
  if (i.kind === "quiz") await db.query("insert into quizzes (lesson_id) values ($1) on conflict (lesson_id) do nothing", [id]);
  await audit({ actorId, action: "lesson.save", entityType: "lesson", entityId: id });
  return id;
}

export async function deleteLesson(id: string) {
  const used = await db.one("select 1 from lesson_progress where lesson_id = $1 limit 1", [id]);
  if (used) throw new AcademyError("Students have progress on this lesson; it can't be deleted.");
  await db.query("delete from lessons where id = $1", [id]);
}

export async function saveQuiz(lessonId: string, input: { passPercent: number; maxAttempts: number | null; questions: unknown }) {
  const questions = z.array(quizQuestionSchema).min(1).max(50).parse(input.questions);
  for (const q of questions) if (!q.options.some((o) => o.correct)) throw new AcademyError(`Question "${q.prompt}" needs a correct answer.`);
  await db.query(
    `insert into quizzes (lesson_id, pass_percent, max_attempts, questions) values ($1,$2,$3,$4)
     on conflict (lesson_id) do update set pass_percent = excluded.pass_percent, max_attempts = excluded.max_attempts, questions = excluded.questions`,
    [lessonId, input.passPercent, input.maxAttempts, JSON.stringify(questions)],
  );
}

export async function addLessonResource(lessonId: string, mediaId: string, title: string) {
  await db.query("insert into lesson_resources (lesson_id, media_id, title, position) values ($1,$2,$3,(select count(*) from lesson_resources where lesson_id = $1))", [lessonId, mediaId, title]);
}

/** Staff-granted access (scholarships, corporate cohorts, offline payments). */
export async function manualEnrol(courseId: string, email: string, fullName: string, actorId: string) {
  await tx(async (t) => {
    const course = await t.one<{ title: string; slug: string }>("select title, slug from courses where id = $1", [courseId]);
    if (!course) throw new AcademyError("Course not found.");
    const c = await upsertContact(t, { email, fullName, source: "manual_enrolment" });
    const user = await t.one<{ user_id: string | null }>("select user_id from contacts where id = $1", [c.id]);
    await t.query(`insert into enrolments (course_id, contact_id, user_id) values ($1,$2,$3) on conflict (course_id, contact_id) do update set status = 'active'`, [courseId, c.id, user?.user_id ?? null]);
    await grantEntitlement(t, { contactId: c.id, userId: user?.user_id ?? null, resourceType: "course", resourceId: courseId, orderId: null, source: "manual" });
    await logActivity(t, c.id, "enrolment", `Enrolled by staff in ${course.title}`, { actorId });
    await audit({ actorId, action: "course.manual_enrol", entityType: "course", entityId: courseId, data: { email } }, t);
    await enqueueEmail({ to: email, template: "course_enrolled", data: { name: fullName || "there", courseTitle: course.title, courseUrl: `${env().APP_URL}/portal/courses/${course.slug}` }, idempotencyKey: `manual-enrol:${courseId}:${c.id}` }, t);
  });
}

export async function reviewAssignment(submissionId: string, status: "reviewed" | "needs_revision", feedback: string, actorId: string) {
  await db.query("update assignment_submissions set status = $2, feedback = $3, reviewed_at = now() where id = $1", [submissionId, status, feedback.slice(0, 4000)]);
  await audit({ actorId, action: "assignment.review", entityType: "assignment", entityId: submissionId });
}

// ---------------- Products ----------------
export const productInput = z.object({
  title: z.string().trim().min(1).max(200), slug: z.string().trim().max(100).default(""),
  kind: z.enum(["ebook", "guide", "template", "workbook", "presentation", "recording", "bundle", "other"]),
  summary: z.string().max(600).default(""), description: z.string().max(20000).default(""),
  coverMediaId: z.union([z.literal(""), z.string().uuid()]).default(""), fileMediaId: z.union([z.literal(""), z.string().uuid()]).default(""),
  price: z.string().default("0"), currency: z.string().length(3).default("GHS"), isLeadMagnet: z.boolean(),
  downloadLimit: z.union([z.literal(""), z.coerce.number().int().min(1).max(100)]).default(""),
  seoTitle: z.string().max(80).default(""), seoDescription: z.string().max(300).default(""),
});

export async function saveProduct(id: string | null, raw: unknown, actorId: string): Promise<string> {
  const i = productInput.parse(raw);
  const price = i.isLeadMagnet ? 0 : parseMajorToMinor(i.price || "0", i.currency);
  if (i.fileMediaId) {
    const f = await db.one<{ visibility: string }>("select visibility from media_assets where id = $1", [i.fileMediaId]);
    if (f?.visibility !== "private") throw new AcademyError("The downloadable file must be uploaded as PRIVATE so it can't be accessed without purchase.");
  }
  const vals = [slugify(i.slug || i.title), i.title, i.kind, i.summary, JSON.stringify(doc(i.description)), i.coverMediaId || null, i.fileMediaId || null,
    price, i.currency.toUpperCase(), i.isLeadMagnet, i.downloadLimit === "" ? null : i.downloadLimit, JSON.stringify({ title: i.seoTitle, description: i.seoDescription })];
  try {
    if (id) await db.query(`update products set slug=$1,title=$2,kind=$3,summary=$4,description=$5,cover_media_id=$6,file_media_id=$7,price_minor=$8,currency=$9,is_lead_magnet=$10,download_limit=$11,seo=$12 where id=$13`, [...vals, id]);
    else id = (await db.one<{ id: string }>(`insert into products (slug,title,kind,summary,description,cover_media_id,file_media_id,price_minor,currency,is_lead_magnet,download_limit,seo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`, vals))!.id;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new AcademyError("Another product uses that URL slug.");
    if (code === "23514") throw new AcademyError("A published product needs a file, and lead magnets must be free.");
    throw e;
  }
  await audit({ actorId, action: "product.save", entityType: "product", entityId: id, data: { price } });
  return id!;
}

export async function setProductStatus(id: string, status: "published" | "draft" | "archived", actorId: string) {
  try {
    await db.query("update products set status = $2, published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end where id = $1", [id, status]);
  } catch (e) {
    if ((e as { code?: string }).code === "23514") throw new AcademyError("Attach the downloadable file before publishing.");
    throw e;
  }
  await audit({ actorId, action: `product.${status}`, entityType: "product", entityId: id });
}
