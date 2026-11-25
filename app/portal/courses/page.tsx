import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { myCourses } from "@/features/portal/application/portal";
import { storage } from "@/lib/storage";

export const metadata = { title: "Courses" };

export default async function MyCourses() {
  const user = await requireUser("/portal/courses");
  const courses = await myCourses(user.id);
  return (
    <div className="space-y-8">
      <h1 className="display-lg">Your courses</h1>
      {courses.length ? (
        <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id}>
              <Link href={`/portal/courses/${c.slug}`} className="group block">
                <div className="img-frame aspect-[4/3]">
                  {c.cover_key ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={storage().publicUrl(c.cover_key)} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : <div className="cover-type absolute inset-0 flex items-end p-6"><span className="font-display text-2xl">{c.title}</span></div>}
                </div>
                <p className="display-sm mt-4">{c.title}</p>
                <div className="mt-3 h-1 bg-[var(--line)]" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} progress`}><div className="h-1 bg-[var(--brand-accent)]" style={{ width: `${c.progress}%` }} /></div>
                <p className="mt-2 text-sm text-[var(--muted-ink)]">{c.progress}% · {c.total} lessons{c.status === "completed" ? " · Completed" : ""}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-[var(--muted-ink)]">No courses yet. <Link href="/academy" className="underline">Browse the academy</Link>.</p>}
    </div>
  );
}
