import { requireStaffPage } from "@/lib/auth/session";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { CourseForm } from "@/components/dashboard/course-form";

export const metadata = { title: "New course" };
export default async function NewCourse() {
  await requireStaffPage("courses:manage");
  return <div className="max-w-4xl"><PageTitle title="New course" back={{ href: "/admin/academy", label: "Academy" }} /><Panel><CourseForm /></Panel></div>;
}
