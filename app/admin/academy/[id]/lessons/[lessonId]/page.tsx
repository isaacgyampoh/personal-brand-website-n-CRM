import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { lessonResourceAction } from "@/features/academy/presentation/admin-actions";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ActionForm, Field, Submit } from "@/components/dashboard/forms";
import { MediaPicker } from "@/components/dashboard/media-picker";
import { LessonEditor } from "@/components/editor/lesson-editor";

export const metadata = { title: "Lesson" };

export default async function LessonAdmin({ params, searchParams }: { params: Promise<{ id: string; lessonId: string }>; searchParams: Promise<{ module?: string }> }) {
  await requireStaffPage("courses:manage");
  const { id, lessonId } = await params;
  const sp = await searchParams;
  const modules = await db.query<{ id: string; title: string }>("select id, title from course_modules where course_id = $1 order by position", [id]);
  if (!modules.length) notFound();
  const isNew = lessonId === "new";
  const l = isNew ? null : await db.one<{ id: string; module_id: string; title: string; kind: string; body: unknown; video_provider: string | null; video_ref: string | null; media_id: string | null; duration_seconds: number | null; is_preview: boolean; release_after_days: number | null }>("select * from lessons where id = $1 and course_id = $2", [lessonId, id]);
  if (!isNew && !l) notFound();
  const quiz = l?.kind === "quiz" ? await db.one<{ pass_percent: number; max_attempts: number | null; questions: unknown[] }>("select * from quizzes where lesson_id = $1", [lessonId]) : null;
  const resources = l ? await db.query<{ id: string; title: string }>("select id, title from lesson_resources where lesson_id = $1", [lessonId]) : [];
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title={l?.title ?? "New lesson"} back={{ href: `/admin/academy/${id}`, label: "Course" }} />
      <LessonEditor courseId={id} modules={modules} quiz={quiz ? { passPercent: quiz.pass_percent, maxAttempts: quiz.max_attempts, questions: quiz.questions } : null}
        initial={{ id: l?.id ?? "", moduleId: l?.module_id ?? sp.module ?? modules[0].id, title: l?.title ?? "", kind: l?.kind ?? "text", body: l?.body ?? { type: "doc", content: [] },
          videoProvider: l?.video_provider ?? "", videoRef: l?.video_ref ?? "", mediaId: l?.media_id ?? "", durationMinutes: l?.duration_seconds ? Math.round(l.duration_seconds / 60) : 0,
          isPreview: l?.is_preview ?? false, releaseAfterDays: l?.release_after_days ?? "" }} />
      {l && (
        <Panel title="Downloadable resources" description={resources.map((r) => r.title).join(" · ") || "None"}>
          <ActionForm action={lessonResourceAction} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="lessonId" value={l.id} />
            <Field label="Title" name="title" required />
            <MediaPicker name="mediaId" label="File (private)" kind="file" visibility="private" />
            <Submit variant="outline">Add resource</Submit>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
