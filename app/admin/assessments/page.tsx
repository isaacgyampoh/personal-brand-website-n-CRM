import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { PageTitle, Table, Td, StatusBadge, Empty } from "@/components/dashboard/ui";
import { StarterButton } from "@/components/dashboard/starter-button";

export const metadata = { title: "Assessments" };
export default async function Assessments() {
  await requireStaffPage("marketing:manage");
  const rows = await db.query<{ id: string; title: string; slug: string; status: string; responses: number; leads: number; avg: number | null }>(
    `select a.*, (select count(*) from assessment_responses r where r.assessment_id = a.id)::int as responses,
       (select count(*) from assessment_responses r where r.assessment_id = a.id and r.consent_contact)::int as leads,
       (select round(avg(overall_percent)) from assessment_responses r where r.assessment_id = a.id) as avg from assessments a order by a.created_at`);
  return (
    <div className="space-y-6">
      <PageTitle title="Brand assessments" description="Interactive quizzes that give visitors deterministic, useful results and invite them to book." actions={<StarterButton />} />
      {rows.length === 0 ? <Empty title="No assessments" body="Start from the 7-category starter assessment and adapt the questions." /> : (
        <Table head={["Assessment", "Responses", "Leads (consented)", "Average score", "Status"]}>
          {rows.map((a) => <tr key={a.id}><Td><Link href={`/admin/assessments/${a.id}`} className="font-medium hover:underline">{a.title}</Link><div className="text-xs text-muted-foreground">/assessment/{a.slug}</div></Td><Td>{a.responses}</Td><Td>{a.leads}</Td><Td>{a.avg ?? "—"}{a.avg !== null ? "%" : ""}</Td><Td><StatusBadge status={a.status} /></Td></tr>)}
        </Table>
      )}
    </div>
  );
}
