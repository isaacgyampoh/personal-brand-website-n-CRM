import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { courseStatusAction, lessonMoveAction, manualEnrolAction, moduleAction, reviewAssignmentAction } from "@/features/academy/presentation/admin-actions";
import { PageTitle, Panel, StatusBadge, LinkButton, Table, Td } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Submit, TextArea } from "@/components/dashboard/forms";
import { CourseForm } from "@/components/dashboard/course-form";

export const metadata = { title: "Course" };

export default async function CourseAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("courses:manage");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "curriculum";
  const c = await db.one<Parameters<typeof CourseForm>[0]["c"] & { status: string }>("select * from courses where id = $1", [id]);
  if (!c) notFound();
  const modules = await db.query<{ id: string; title: string; release_after_days: number | null }>("select * from course_modules where course_id = $1 order by position", [id]);
  const lessons = await db.query<{ id: string; module_id: string; title: string; kind: string; is_preview: boolean; release_after_days: number | null }>("select id, module_id, title, kind, is_preview, release_after_days from lessons where course_id = $1 order by position", [id]);
  const students = tab === "students" ? await db.query<{ id: string; name: string; email: string; status: string; progress: number; enrolled_at: Date }>(
    `select e.id, coalesce(nullif(c.full_name,''), c.email::text) as name, c.email, e.status, e.enrolled_at,
       coalesce(round(100.0 * (select count(*) from lesson_progress p where p.enrolment_id = e.id and p.completed_at is not null) / nullif((select count(*) from lessons l where l.course_id = e.course_id),0)),0)::int as progress
     from enrolments e join contacts c on c.id = e.contact_id where e.course_id = $1 order by e.enrolled_at desc`, [id]) : [];
  const submissions = tab === "assignments" ? await db.query<{ id: string; body: string; status: string; feedback: string; lesson: string; name: string; created_at: Date }>(
    `select s.id, s.body, s.status, s.feedback, l.title as lesson, coalesce(nullif(c.full_name,''), c.email::text) as name, s.created_at
       from assignment_submissions s join lessons l on l.id = s.lesson_id join enrolments e on e.id = s.enrolment_id join contacts c on c.id = e.contact_id
      where l.course_id = $1 order by s.status = 'submitted' desc, s.created_at desc`, [id]) : [];
  return (
    <div className="space-y-6">
      <PageTitle title={c.title} back={{ href: "/admin/academy", label: "Academy" }} actions={<>
        <StatusBadge status={c.status} />
        {c.status !== "published" ? <ActionButton action={courseStatusAction} fields={{ id, status: "published" }} label="Publish" variant="default" /> : <ActionButton action={courseStatusAction} fields={{ id, status: "draft" }} label="Unpublish" />}
        <LinkButton href={`/academy/${c.slug}`} variant="outline" target="_blank">View ↗</LinkButton>
      </>} />
      <nav className="flex gap-1 border-b" aria-label="Course sections">
        {[["curriculum", "Curriculum"], ["details", "Details & pricing"], ["students", "Students"], ["assignments", "Assignments"]].map(([k, l]) => (
          <Link key={k} href={`/admin/academy/${id}?tab=${k}`} className={`border-b-2 px-3 py-2 text-sm ${tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}>{l}</Link>
        ))}
      </nav>
      {tab === "details" && <Panel><CourseForm c={c} /></Panel>}
      {tab === "curriculum" && (
        <div className="space-y-4">
          {modules.map((m, mi) => (
            <Panel key={m.id} title={`Module ${mi + 1}: ${m.title}`} description={m.release_after_days !== null ? `Unlocks ${m.release_after_days} days after enrolment` : "Available immediately"}
              actions={<div className="flex gap-1">
                <ActionButton action={moduleAction} fields={{ op: "up", id: m.id }} label="↑" success="Moved" />
                <ActionButton action={moduleAction} fields={{ op: "down", id: m.id }} label="↓" success="Moved" />
                <ActionButton action={moduleAction} fields={{ op: "delete", id: m.id }} label="Delete" variant="destructive" confirm="Delete this module and its lessons?" />
              </div>}>
              <ul className="divide-y text-sm">
                {lessons.filter((l) => l.module_id === m.id).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/admin/academy/${id}/lessons/${l.id}`} className="hover:underline"><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase">{l.kind}</span>{l.title}{l.is_preview && <span className="ml-2 text-xs text-emerald-700">free preview</span>}</Link>
                    <span className="flex gap-1">
                      <ActionButton action={lessonMoveAction} fields={{ op: "up", id: l.id }} label="↑" success="Moved" />
                      <ActionButton action={lessonMoveAction} fields={{ op: "down", id: l.id }} label="↓" success="Moved" />
                      <ActionButton action={lessonMoveAction} fields={{ op: "delete", id: l.id }} label="✕" variant="destructive" confirm="Delete lesson?" success="Deleted" />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href={`/admin/academy/${id}/lessons/new?module=${m.id}`} size="sm" variant="outline">+ Lesson</LinkButton>
                <details className="text-sm"><summary className="cursor-pointer py-1 text-muted-foreground">Rename / drip</summary>
                  <ActionForm action={moduleAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="courseId" value={id} /><input type="hidden" name="id" value={m.id} />
                    <Field label="Title" name="title" defaultValue={m.title} />
                    <Field label="Unlock after (days)" name="releaseAfterDays" type="number" defaultValue={m.release_after_days ?? ""} />
                    <div className="flex items-end"><Submit variant="outline">Save</Submit></div>
                  </ActionForm>
                </details>
              </div>
            </Panel>
          ))}
          <Panel title="Add module">
            <ActionForm action={moduleAction} resetOnSuccess className="flex flex-wrap gap-2">
              <input type="hidden" name="courseId" value={id} />
              <Field label="Module title" name="title" required />
              <Field label="Unlock after days (optional)" name="releaseAfterDays" type="number" />
              <div className="flex items-end"><Submit>Add module</Submit></div>
            </ActionForm>
          </Panel>
        </div>
      )}
      {tab === "students" && (
        <div className="space-y-4">
          <Panel title="Enrol a student" description="For scholarships, corporate cohorts or offline payments. They receive an email.">
            <ActionForm action={manualEnrolAction} resetOnSuccess className="flex flex-wrap gap-2">
              <input type="hidden" name="courseId" value={id} />
              <Field label="Full name" name="fullName" /><Field label="Email" name="email" type="email" required />
              <div className="flex items-end"><Submit>Enrol</Submit></div>
            </ActionForm>
          </Panel>
          <Table head={["Student", "Progress", "Status", "Enrolled"]}>
            {students.map((s) => <tr key={s.id}><Td>{s.name}<div className="text-xs text-muted-foreground">{s.email}</div></Td><Td>{s.progress}%</Td><Td><StatusBadge status={s.status} /></Td><Td className="text-xs">{s.enrolled_at.toLocaleDateString("en-GB")}</Td></tr>)}
          </Table>
        </div>
      )}
      {tab === "assignments" && (
        <div className="space-y-4">
          {submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions.</p>}
          {submissions.map((s) => (
            <Panel key={s.id} title={`${s.name} — ${s.lesson}`} actions={<StatusBadge status={s.status} />}>
              <p className="whitespace-pre-wrap text-sm">{s.body}</p>
              <ActionForm action={reviewAssignmentAction} className="mt-4 space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <TextArea label="Feedback to student" name="feedback" defaultValue={s.feedback} rows={3} />
                <div className="flex gap-2"><Submit name="status" value="reviewed">Mark reviewed</Submit><Submit name="status" value="needs_revision" variant="outline">Needs revision</Submit></div>
              </ActionForm>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
