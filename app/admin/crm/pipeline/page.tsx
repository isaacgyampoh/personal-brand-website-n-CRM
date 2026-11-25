import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { pipelineStages } from "@/features/crm/application/admin";
import { loadSetting } from "@/features/settings/application/settings";
import { PageTitle, LinkButton } from "@/components/dashboard/ui";
import { PipelineBoard } from "@/components/dashboard/pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const user = await requireStaffPage("crm:view");
  const [stages, biz] = await Promise.all([pipelineStages(), loadSetting("business")]);
  const contacts = await db.query<{ id: string; name: string; company: string; stage_id: string; total_spent_minor: number; next_follow_up_at: Date | null; last_activity_at: Date | null }>(
    `select id, coalesce(nullif(full_name,''), email::text, phone) as name, company, stage_id, total_spent_minor, next_follow_up_at, last_activity_at
       from contacts where deleted_at is null and stage_id is not null
       order by last_activity_at desc nulls last limit 600`,
  );
  return (
    <div>
      <PageTitle title="Lead pipeline" description="Drag cards between stages (or use the menu on each card). Closed stages show the 30 most recent." actions={<LinkButton href="/admin/crm" variant="outline">List view</LinkButton>} />
      <PipelineBoard
        canEdit={user.permissions.has("crm:edit")}
        currency={biz.currency}
        stages={stages}
        contacts={contacts.map((c) => ({ ...c, next_follow_up_at: c.next_follow_up_at?.toISOString() ?? null, last_activity_at: c.last_activity_at?.toISOString() ?? null }))}
      />
    </div>
  );
}
