import type { Metadata } from "next";
import { getPublicCourses } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { CourseCard } from "@/components/website/cards";

export const metadata: Metadata = { title: "Academy", alternates: { canonical: "/academy" } };

export default async function AcademyPage() {
  const courses = (await getPublicCourses()).filter((c) => c.visibility === "public");
  return (
    <>
      <PageHeader eyebrow="Academy" title="Learn at your *own pace*" intro="Self-paced programmes and recorded classes you can return to whenever you need them." />
      {courses.length ? (
        <div className="site-container grid gap-x-10 gap-y-16 pb-28 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} c={c} />)}
        </div>
      ) : (
        <EmptyState title="New programmes are in production." body="Join the newsletter to be told when enrolment opens." />
      )}
    </>
  );
}
