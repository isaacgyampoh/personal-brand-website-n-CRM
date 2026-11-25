import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { formatMoney } from "@/lib/money";
import { PageTitle, Table, Td, StatusBadge, LinkButton, Empty } from "@/components/dashboard/ui";

export const metadata = { title: "Academy" };

export default async function AcademyAdmin() {
  await requireStaffPage("courses:manage");
  const rows = await db.query<{ id: string; title: string; slug: string; status: string; price_minor: number; currency: string; lessons: number; students: number; completed: number; is_demo: boolean }>(
    `select c.*, (select count(*) from lessons l where l.course_id = c.id)::int as lessons,
       (select count(*) from enrolments e where e.course_id = c.id and e.status in ('active','completed'))::int as students,
       (select count(*) from enrolments e where e.course_id = c.id and e.status = 'completed')::int as completed
     from courses c order by c.created_at desc`);
  return (
    <div>
      <PageTitle title="Academy" description="Online courses and programmes." actions={<LinkButton href="/admin/academy/new">New course</LinkButton>} />
      {rows.length === 0 ? <Empty title="No courses yet" action={<LinkButton href="/admin/academy/new">Create a course</LinkButton>} /> : (
        <Table head={["Course", "Price", "Lessons", "Students", "Status"]}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-muted/40">
              <Td><Link href={`/admin/academy/${c.id}`} className="font-medium hover:underline">{c.title}</Link><div className="text-xs text-muted-foreground">/{c.slug}{c.is_demo ? " · demo" : ""}</div></Td>
              <Td>{c.price_minor ? formatMoney(c.price_minor, c.currency) : "Free"}</Td>
              <Td>{c.lessons}</Td>
              <Td>{c.students}{c.completed ? <span className="text-xs text-muted-foreground"> · {c.completed} completed</span> : null}</Td>
              <Td><StatusBadge status={c.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
