import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { audienceSize, audienceSchema } from "@/features/marketing/application/campaigns";
import { campaignSendAction } from "@/features/marketing/presentation/actions";
import { PageTitle, Panel, StatusBadge, Stat } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Check, Field, Submit } from "@/components/dashboard/forms";
import { CampaignForm } from "@/components/dashboard/campaign-form";

export const metadata = { title: "Campaign" };
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("marketing:manage");
  const { id } = await params;
  const c = await db.one<{ id: string; name: string; subject: string; preheader: string; body: string; audience: { type: string }; status: string }>("select * from campaigns where id = $1", [id]);
  if (!c) notFound();
  const [lists, tags, stats] = await Promise.all([
    db.query<{ id: string; name: string }>("select id, name from mailing_lists order by name"),
    db.query<{ id: string; name: string }>("select id, name::text from crm_tags order by name"),
    db.one<{ total: number; accepted: number; failed: number; suppressed: number; clicks: number }>(
      `select count(*)::int as total, count(*) filter (where n.status in ('accepted','delivered'))::int as accepted, count(*) filter (where n.status = 'failed')::int as failed,
         count(*) filter (where n.status = 'suppressed')::int as suppressed,
         (select count(*) from link_clicks lc join campaign_links l on l.id = lc.link_id where l.campaign_id = $1)::int as clicks
       from campaign_recipients r left join notifications n on n.id = r.notification_id where r.campaign_id = $1`, [id]),
  ]);
  const size = await audienceSize(audienceSchema.parse(c.audience));
  const editable = ["draft", "scheduled"].includes(c.status);
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title={c.name} back={{ href: "/admin/marketing", label: "Marketing" }} actions={<StatusBadge status={c.status} />} />
      {c.status !== "draft" && <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Recipients" value={stats?.total ?? 0} /><Stat label="Accepted by mail server" value={stats?.accepted ?? 0} hint="not proof of inbox delivery" /><Stat label="Failed" value={stats?.failed ?? 0} /><Stat label="Suppressed" value={stats?.suppressed ?? 0} /></div>}
      {editable && <Panel title="Content"><CampaignForm c={c} lists={lists} tags={tags} /></Panel>}
      {!editable && <Panel title="Content"><p className="font-medium">{c.subject}</p><p className="mt-3 whitespace-pre-wrap text-sm">{c.body}</p></Panel>}
      {c.status === "draft" && (
        <Panel title="Send" description={`${size} confirmed subscriber(s) currently match this audience.`}>
          <div className="space-y-4">
            <ActionButton action={campaignSendAction} fields={{ id, op: "test" }} label="Send test to me" success="Test queued to your email" />
            <ActionForm action={campaignSendAction} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="schedule" /><Field label="Schedule for" name="when" type="datetime-local" required /><Submit variant="outline">Schedule</Submit></ActionForm>
            <ActionForm action={campaignSendAction} confirm={`Send to ${size} subscribers now?`} className="space-y-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="send" /><Check label={`I confirm these ${size} people opted in to receive this email`} name="confirm" /><Submit>Send now</Submit></ActionForm>
          </div>
        </Panel>
      )}
      {c.status === "scheduled" && <ActionButton action={campaignSendAction} fields={{ id, op: "cancel" }} label="Cancel schedule" />}
    </div>
  );
}
