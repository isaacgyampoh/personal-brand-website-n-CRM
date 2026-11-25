import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { lessonForUser, AcademyError } from "@/features/academy/application/learning";
import { RichText } from "@/components/shared/rich-text";
import { LessonControls, QuizForm, AssignmentForm, TrackedVideo } from "@/components/portal/lesson-controls";

export const metadata = { title: "Lesson" };
export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const user = await requireUser("/portal/courses");
  const { slug, lessonId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(lessonId)) notFound();
  let data;
  try {
    data = await lessonForUser(slug, lessonId, user.id);
  } catch (e) {
    if (e instanceof AcademyError) return <div className="max-w-xl"><p className="display-sm">{e.message}</p><Link href={`/academy/${slug}`} className="btn btn-primary mt-6">View course</Link></div>;
    throw e;
  }
  if (!data) notFound();
  const all = data.outline.flatMap((m) => m.lessons);
  const idx = all.findIndex((l) => l.id === lessonId);
  const prev = all.slice(0, idx).reverse().find((l) => !l.locked);
  const next = all.slice(idx + 1).find((l) => !l.locked);
  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <aside className="order-2 lg:order-1 lg:col-span-3">
        <Link href={`/portal/courses/${slug}`} className="eyebrow">← {data.course.title}</Link>
        <div className="mt-4 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--brand-accent)]" style={{ width: `${data.progress}%` }} /></div>
        <nav aria-label="Lessons" className="mt-6 space-y-5">
          {data.outline.map((m) => (
            <div key={m.id}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-ink)]">{m.title}</p>
              <ul className="mt-2 space-y-1">
                {m.lessons.map((l) => (
                  <li key={l.id}>{l.locked ? <span className="block py-1 text-sm text-[var(--muted-ink)]">🔒 {l.title}</span> : (
                    <Link href={`/portal/courses/${slug}/${l.id}`} aria-current={l.id === lessonId ? "page" : undefined} className={`block py-1 text-sm ${l.id === lessonId ? "font-semibold text-[var(--brand-accent)]" : "hover:text-[var(--brand-accent)]"}`}>{l.completed ? "✓ " : ""}{l.title}</Link>
                  )}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <article className="order-1 lg:order-2 lg:col-span-8 lg:col-start-5">
        <p className="eyebrow capitalize">{data.lesson.kind}</p>
        <h1 className="display-md mt-3">{data.lesson.title}</h1>
        {data.embed && <div className="img-frame mt-8 aspect-video"><iframe src={data.embed} title={data.lesson.title} className="absolute inset-0 size-full" allow="encrypted-media; picture-in-picture; fullscreen" /></div>}
        {data.media?.mime.startsWith("video/") && <TrackedVideo lessonId={lessonId} src={data.media.url} />}
        {data.media?.mime.startsWith("audio/") && <audio controls src={data.media.url} className="mt-8 w-full" />}
        <div className="mt-8"><RichText doc={data.lesson.body} /></div>
        {data.resources.length > 0 && (
          <section className="mt-10"><h2 className="eyebrow mb-3">Resources</h2>
            <ul className="space-y-2">{data.resources.map((r, i) => <li key={i}>{r.url ? <a className="underline" href={r.url}>{r.title}</a> : r.title}</li>)}</ul>
          </section>
        )}
        {data.quiz && <QuizForm lessonId={lessonId} quiz={{ ...data.quiz, attempts: data.quiz.attempts.map((a) => ({ ...a, created_at: a.created_at.toISOString() })) }} />}
        {data.lesson.kind === "assignment" && data.enrolment && <AssignmentForm lessonId={lessonId} existing={data.submission} />}
        {data.enrolment && data.lesson.kind !== "quiz" && data.lesson.kind !== "assignment" && <LessonControls lessonId={lessonId} completed={data.nav.completed} />}
        {!data.enrolment && <div className="card-frame mt-10 p-6"><p>This is a free preview.</p><Link href={`/academy/${slug}`} className="btn btn-primary mt-4">Enrol to continue</Link></div>}
        <nav className="mt-14 flex justify-between border-t border-[var(--line)] pt-6" aria-label="Lesson navigation">
          {prev ? <Link className="btn btn-link" href={`/portal/courses/${slug}/${prev.id}`}>← {prev.title}</Link> : <span />}
          {next && <Link className="btn btn-link" href={`/portal/courses/${slug}/${next.id}`}>{next.title} →</Link>}
        </nav>
      </article>
    </div>
  );
}
