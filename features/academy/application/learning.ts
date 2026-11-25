import "server-only";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { storage } from "@/lib/storage";
import { UserError } from "@/lib/errors";
import { logActivity } from "@/features/crm/application/contacts";
import { issueCertificate } from "./certificates";

export class AcademyError extends UserError {}

export const quizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  multiple: z.boolean().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), correct: z.boolean() })).min(2),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

type Enrolment = { id: string; course_id: string; contact_id: string; status: string; enrolled_at: Date; completed_at: Date | null; last_lesson_id: string | null };

/** Active enrolment for the signed-in user (via verified contact link), or null. */
export async function enrolmentFor(userId: string, courseId: string): Promise<Enrolment | null> {
  return db.one<Enrolment>(
    `select e.* from enrolments e join contacts c on c.id = e.contact_id
      where e.course_id = $1 and c.user_id = $2 and e.status in ('active','completed')
        and exists (select 1 from entitlements x where x.contact_id = e.contact_id and x.resource_type = 'course' and x.resource_id = e.course_id and x.revoked_at is null)`,
    [courseId, userId],
  );
}

function releaseDate(enrolledAt: Date, item: { release_at: Date | null; release_after_days: number | null }): Date | null {
  if (item.release_at) return item.release_at;
  if (item.release_after_days !== null && item.release_after_days !== undefined) return new Date(enrolledAt.getTime() + item.release_after_days * 86400_000);
  return null;
}

export type LessonNav = { id: string; title: string; kind: string; position: number; duration_seconds: number | null; is_preview: boolean; completed: boolean; releasedAt: Date | null; locked: boolean };

export async function courseOutline(courseSlug: string, userId: string | null) {
  const course = await db.one<{ id: string; slug: string; title: string; status: string; certificate_enabled: boolean; completion_percent: number; require_quizzes_passed: boolean; summary: string }>(
    "select * from courses where slug = $1 and status in ('published','archived')", [courseSlug]);
  if (!course) return null;
  const enrolment = userId ? await enrolmentFor(userId, course.id) : null;
  const modules = await db.query<{ id: string; title: string; position: number; release_at: Date | null; release_after_days: number | null }>(
    "select * from course_modules where course_id = $1 order by position", [course.id]);
  const lessons = await db.query<{ id: string; module_id: string; title: string; kind: string; position: number; duration_seconds: number | null; is_preview: boolean; release_at: Date | null; release_after_days: number | null }>(
    "select id, module_id, title, kind, position, duration_seconds, is_preview, release_at, release_after_days from lessons where course_id = $1 order by position", [course.id]);
  const done = enrolment
    ? new Set((await db.query<{ lesson_id: string }>("select lesson_id from lesson_progress where enrolment_id = $1 and completed_at is not null", [enrolment.id])).map((r) => r.lesson_id))
    : new Set<string>();
  const now = new Date();
  const outline = modules.map((m) => {
    const mRelease = enrolment ? releaseDate(enrolment.enrolled_at, m) : null;
    return {
      ...m,
      lessons: lessons.filter((l) => l.module_id === m.id).map<LessonNav>((l) => {
        const rel = enrolment ? releaseDate(enrolment.enrolled_at, l) ?? mRelease : null;
        const locked = !enrolment ? !l.is_preview : Boolean(rel && rel > now);
        return { id: l.id, title: l.title, kind: l.kind, position: l.position, duration_seconds: l.duration_seconds, is_preview: l.is_preview, completed: done.has(l.id), releasedAt: rel, locked };
      }),
    };
  });
  const total = lessons.length;
  const progress = total ? Math.round((done.size / total) * 100) : 0;
  return { course, enrolment, outline, progress, total, completedCount: done.size };
}

/**
 * Returns a lesson only if the user is entitled (or it is a free preview) and
 * it has been released. Private media is delivered via short-lived signed URLs.
 */
export async function lessonForUser(courseSlug: string, lessonId: string, userId: string | null) {
  const o = await courseOutline(courseSlug, userId);
  if (!o) return null;
  const nav = o.outline.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!nav) return null;
  if (nav.locked) {
    if (!o.enrolment) throw new AcademyError("Enrol in this course to access this lesson.");
    throw new AcademyError(`This lesson unlocks on ${nav.releasedAt?.toDateString()}.`);
  }
  const lesson = await db.one<{ id: string; title: string; kind: string; body: unknown; video_provider: string | null; video_ref: string | null; media_id: string | null }>(
    "select id, title, kind, body, video_provider, video_ref, media_id from lessons where id = $1", [lessonId]);
  if (!lesson) return null;

  let media: { url: string; mime: string } | null = null;
  if (lesson.media_id) {
    const m = await db.one<{ storage_key: string; visibility: "public" | "private"; mime_type: string }>("select storage_key, visibility, mime_type from media_assets where id = $1 and deleted_at is null", [lesson.media_id]);
    if (m) media = { url: m.visibility === "public" ? storage().publicUrl(m.storage_key) : await storage().signedUrl(m.storage_key, { expiresInSeconds: 3 * 3600, contentType: m.mime_type }), mime: m.mime_type };
  }
  let embed: string | null = null;
  if (lesson.video_ref && lesson.video_provider === "youtube_unlisted") embed = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(lesson.video_ref)}?rel=0&modestbranding=1`;
  if (lesson.video_ref && lesson.video_provider === "vimeo") embed = `https://player.vimeo.com/video/${encodeURIComponent(lesson.video_ref)}?dnt=1`;

  const resources = await Promise.all((await db.query<{ id: string; title: string; storage_key: string; filename: string; mime_type: string }>(
    `select r.id, r.title, m.storage_key, m.filename, m.mime_type from lesson_resources r join media_assets m on m.id = r.media_id where r.lesson_id = $1 order by r.position`, [lessonId],
  )).map(async (r) => ({ title: r.title, url: o.enrolment ? await storage().signedUrl(r.storage_key, { expiresInSeconds: 600, downloadName: r.filename }) : null })));

  let quiz: { id: string; passPercent: number; questions: { id: string; prompt: string; multiple: boolean; options: { id: string; label: string }[] }[]; attempts: { score_percent: number; passed: boolean; created_at: Date }[]; maxAttempts: number | null } | null = null;
  if (lesson.kind === "quiz") {
    const q = await db.one<{ id: string; pass_percent: number; questions: QuizQuestion[]; max_attempts: number | null }>("select * from quizzes where lesson_id = $1", [lessonId]);
    if (q) {
      quiz = {
        id: q.id, passPercent: q.pass_percent, maxAttempts: q.max_attempts,
        // Correct answers are stripped before leaving the server.
        questions: q.questions.map((x) => ({ id: x.id, prompt: x.prompt, multiple: Boolean(x.multiple), options: x.options.map((op) => ({ id: op.id, label: op.label })) })),
        attempts: o.enrolment ? await db.query("select score_percent, passed, created_at from quiz_attempts where quiz_id = $1 and enrolment_id = $2 order by created_at desc", [q.id, o.enrolment.id]) : [],
      };
    }
  }
  const submission = lesson.kind === "assignment" && o.enrolment
    ? await db.one<{ body: string; status: string; feedback: string }>("select body, status, feedback from assignment_submissions where lesson_id = $1 and enrolment_id = $2", [lessonId, o.enrolment.id])
    : null;
  if (o.enrolment) await db.query("update enrolments set last_lesson_id = $2 where id = $1", [o.enrolment.id, lessonId]);
  return { ...o, lesson, nav, media, embed, resources, quiz, submission };
}

async function requireEnrolment(userId: string, lessonId: string) {
  const row = await db.one<{ course_id: string; slug: string }>("select l.course_id, c.slug from lessons l join courses c on c.id = l.course_id where l.id = $1", [lessonId]);
  if (!row) throw new AcademyError("Lesson not found.");
  const enrolment = await enrolmentFor(userId, row.course_id);
  if (!enrolment) throw new AcademyError("You're not enrolled in this course.");
  const access = await lessonForUser(row.slug, lessonId, userId); // enforces release schedule
  if (!access) throw new AcademyError("Lesson not found.");
  return { enrolment, courseId: row.course_id, slug: row.slug };
}

export async function markLessonComplete(userId: string, lessonId: string, complete = true) {
  const { enrolment, courseId } = await requireEnrolment(userId, lessonId);
  const kind = await db.one<{ kind: string }>("select kind from lessons where id = $1", [lessonId]);
  if (complete && kind?.kind === "quiz") throw new AcademyError("Pass the quiz to complete this lesson.");
  await db.query(
    `insert into lesson_progress (enrolment_id, lesson_id, completed_at) values ($1,$2, case when $3 then now() end)
     on conflict (enrolment_id, lesson_id) do update set completed_at = case when $3 then coalesce(lesson_progress.completed_at, now()) end, updated_at = now()`,
    [enrolment.id, lessonId, complete],
  );
  return checkCompletion(enrolment.id, courseId, userId);
}

export async function savePosition(userId: string, lessonId: string, seconds: number) {
  const { enrolment } = await requireEnrolment(userId, lessonId);
  await db.query(
    `insert into lesson_progress (enrolment_id, lesson_id, position_seconds) values ($1,$2,$3)
     on conflict (enrolment_id, lesson_id) do update set position_seconds = excluded.position_seconds, updated_at = now()`,
    [enrolment.id, lessonId, Math.max(0, Math.min(seconds, 86400))],
  );
}

export async function submitQuiz(userId: string, lessonId: string, answers: Record<string, string[]>) {
  const { enrolment, courseId } = await requireEnrolment(userId, lessonId);
  const q = await db.one<{ id: string; pass_percent: number; questions: QuizQuestion[]; max_attempts: number | null }>("select * from quizzes where lesson_id = $1", [lessonId]);
  if (!q) throw new AcademyError("Quiz not found.");
  const attempts = await db.one<{ n: number }>("select count(*)::int as n from quiz_attempts where quiz_id = $1 and enrolment_id = $2", [q.id, enrolment.id]);
  if (q.max_attempts && (attempts?.n ?? 0) >= q.max_attempts) throw new AcademyError("You've used all attempts for this quiz.");
  let correct = 0;
  for (const question of q.questions) {
    const right = question.options.filter((o) => o.correct).map((o) => o.id).sort().join(",");
    const given = [...(answers[question.id] ?? [])].sort().join(",");
    if (right === given) correct++;
  }
  const score = q.questions.length ? Math.round((correct / q.questions.length) * 100) : 0;
  const passed = score >= q.pass_percent;
  await tx(async (t) => {
    await t.query("insert into quiz_attempts (quiz_id, enrolment_id, answers, score_percent, passed) values ($1,$2,$3,$4,$5)", [q.id, enrolment.id, JSON.stringify(answers), score, passed]);
    if (passed) {
      await t.query(
        `insert into lesson_progress (enrolment_id, lesson_id, completed_at) values ($1,$2,now())
         on conflict (enrolment_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now())`,
        [enrolment.id, lessonId],
      );
    }
  });
  const completion = await checkCompletion(enrolment.id, courseId, userId);
  return { score, passed, passPercent: q.pass_percent, ...completion };
}

export async function submitAssignment(userId: string, lessonId: string, body: string) {
  const { enrolment } = await requireEnrolment(userId, lessonId);
  const text = body.trim();
  if (text.length < 10) throw new AcademyError("Please write a little more.");
  await db.query(
    `insert into assignment_submissions (lesson_id, enrolment_id, body) values ($1,$2,$3)
     on conflict (lesson_id, enrolment_id) do update set body = excluded.body, status = 'submitted', created_at = now()`,
    [lessonId, enrolment.id, text.slice(0, 20000)],
  );
  await db.query(
    `insert into lesson_progress (enrolment_id, lesson_id, completed_at) values ($1,$2,now())
     on conflict (enrolment_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now())`,
    [enrolment.id, lessonId],
  );
}

/** Marks the enrolment complete and issues a certificate when requirements are met. */
async function checkCompletion(enrolmentId: string, courseId: string, userId: string): Promise<{ courseCompleted: boolean; certificateCode: string | null }> {
  const c = await db.one<{ title: string; completion_percent: number; require_quizzes_passed: boolean; certificate_enabled: boolean }>("select * from courses where id = $1", [courseId]);
  const stats = await db.one<{ total: number; done: number; quizzes: number; quizzes_passed: number }>(
    `select (select count(*) from lessons where course_id = $1)::int as total,
            (select count(*) from lesson_progress p join lessons l on l.id = p.lesson_id where p.enrolment_id = $2 and l.course_id = $1 and p.completed_at is not null)::int as done,
            (select count(*) from quizzes q join lessons l on l.id = q.lesson_id where l.course_id = $1)::int as quizzes,
            (select count(distinct q.id) from quizzes q join lessons l on l.id = q.lesson_id join quiz_attempts a on a.quiz_id = q.id and a.passed where l.course_id = $1 and a.enrolment_id = $2)::int as quizzes_passed`,
    [courseId, enrolmentId],
  );
  if (!c || !stats || !stats.total) return { courseCompleted: false, certificateCode: null };
  const pct = Math.round((stats.done / stats.total) * 100);
  const ok = pct >= c.completion_percent && (!c.require_quizzes_passed || stats.quizzes_passed >= stats.quizzes);
  if (!ok) return { courseCompleted: false, certificateCode: null };
  const e = await db.one<{ contact_id: string; completed_at: Date | null }>(
    "update enrolments set status = 'completed', completed_at = coalesce(completed_at, now()) where id = $1 returning contact_id, completed_at", [enrolmentId]);
  let code: string | null = null;
  if (c.certificate_enabled && e) {
    const person = await db.one<{ full_name: string; email: string }>("select full_name, email from contacts where id = $1", [e.contact_id]);
    code = await issueCertificate({ contactId: e.contact_id, courseId, recipientName: person?.full_name || person?.email || "Student", title: c.title, email: person!.email, userId });
    if (code) await tx((t) => logActivity(t, e.contact_id, "enrolment", `Completed ${c.title}`));
  }
  return { courseCompleted: true, certificateCode: code };
}
