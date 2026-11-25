import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { courseOutline } from "@/features/academy/application/learning";

export const metadata = { title: "Course" };

export default async function CourseHome({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser("/portal/courses");
  const { slug } = await params;
  const o = await courseOutline(slug, user.id);
  if (!o) notFound();
  if (!o.enrolment) redirect(`/academy/${slug}`);
  const firstOpen = o.outline.flatMap((m) => m.lessons).find((l) => !l.completed && !l.locked);
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <Link href="/portal/courses" className="eyebrow">← Courses</Link>
        <h1 className="display-lg mt-4">{o.course.title}</h1>
        <div className="mt-6 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--brand-accent)]" style={{ width: `${o.progress}%` }} /></div>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">{o.completedCount} of {o.total} lessons complete</p>
        {firstOpen && <Link href={`/portal/courses/${slug}/${o.enrolment.last_lesson_id ?? firstOpen.id}`} className="btn btn-primary mt-6">{o.completedCount ? "Resume" : "Start"} <span aria-hidden className="arrow">→</span></Link>}
      </div>
      {o.outline.map((m, i) => (
        <section key={m.id} aria-labelledby={`m-${m.id}`}>
          <h2 id={`m-${m.id}`} className="eyebrow mb-3">Module {i + 1} · {m.title}</h2>
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {m.lessons.map((l) => (
              <li key={l.id}>
                {l.locked ? (
                  <div className="flex justify-between py-4 text-[var(--muted-ink)]"><span>🔒 {l.title}</span><span className="text-sm">Unlocks {l.releasedAt?.toLocaleDateString()}</span></div>
                ) : (
                  <Link href={`/portal/courses/${slug}/${l.id}`} className="flex justify-between gap-4 py-4 hover:text-[var(--brand-accent)]">
                    <span>{l.completed ? "✓ " : ""}{l.title}</span><span className="text-sm capitalize text-[var(--muted-ink)]">{l.kind}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
