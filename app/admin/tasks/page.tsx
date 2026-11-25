import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { loadSetting } from "@/features/settings/application/settings";
import { taskAction, taskStatusAction } from "@/features/crm/presentation/actions";
import { formatInZone } from "@/lib/time";
import { PageTitle, Panel, StatusBadge, Empty } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/dashboard/forms";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaffPage("crm:view");
  const show = (await searchParams).show === "done" ? "done" : "open";
  const tz = (await loadSetting("business")).timezone;
  const tasks = await db.query<{ id: string; title: string; notes: string; due_at: Date | null; priority: string; status: string; contact_id: string | null; contact: string | null }>(
    `select t.*, coalesce(nullif(c.full_name,''), c.email::text) as contact from tasks t left join contacts c on c.id = t.contact_id
      where t.status = $1 order by t.due_at nulls last, t.created_at desc limit 300`,
    [show],
  );
  return (
    <div className="space-y-6">
      <PageTitle title="Tasks & follow-ups" actions={<div className="flex gap-2 text-sm"><Link href="/admin/tasks" className={show === "open" ? "font-semibold" : "text-muted-foreground"}>Open</Link><Link href="/admin/tasks?show=done" className={show === "done" ? "font-semibold" : "text-muted-foreground"}>Completed</Link></div>} />
      <Panel title="New task">
        <ActionForm action={taskAction} success="Task added" resetOnSuccess className="grid gap-3 sm:grid-cols-4">
          <Field label="Title" name="title" required className="sm:col-span-2" />
          <Field label="Due" name="dueAt" type="datetime-local" />
          <Select label="Priority" name="priority" defaultValue="normal" options={[["low", "Low"], ["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"]] as const} />
          <div><Submit>Add task</Submit></div>
        </ActionForm>
      </Panel>
      {tasks.length === 0 ? <Empty title={show === "open" ? "No open tasks" : "No completed tasks"} body="Tasks are also created automatically for enquiries and orders that need attention." /> : (
        <ul className="divide-y rounded-xl border bg-background">
          {tasks.map((t) => {
            const overdue = t.status === "open" && t.due_at && t.due_at < new Date();
            return (
              <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t.title} {t.priority !== "normal" && <StatusBadge status={t.priority} tone={t.priority === "urgent" || t.priority === "high" ? "red" : "gray"} />}</p>
                  {t.notes && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{t.notes}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.due_at && <span className={overdue ? "font-medium text-red-600" : ""}>Due {formatInZone(t.due_at, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                    {t.contact_id && <> · <Link href={`/admin/crm/${t.contact_id}`} className="underline">{t.contact}</Link></>}
                  </p>
                </div>
                {t.status === "open" ? (
                  <div className="flex gap-2"><ActionButton action={taskStatusAction} fields={{ id: t.id, status: "done" }} label="Mark done" /><ActionButton action={taskStatusAction} fields={{ id: t.id, status: "cancelled" }} label="Dismiss" variant="secondary" /></div>
                ) : <ActionButton action={taskStatusAction} fields={{ id: t.id, status: "open" }} label="Reopen" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
