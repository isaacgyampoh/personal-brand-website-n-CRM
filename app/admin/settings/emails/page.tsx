import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { DEFAULT_TEMPLATES } from "@/features/notifications/domain/templates";
import { saveTemplateAction } from "@/features/settings/presentation/actions";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Submit, TextArea } from "@/components/dashboard/forms";

export const metadata = { title: "Email templates" };
export default async function EmailTemplates() {
  await requireStaffPage("settings:manage");
  const overrides = new Map((await db.query<{ key: string; subject: string; body: string }>("select key, subject, body from email_templates")).map((r) => [r.key, r]));
  return (
    <div className="max-w-4xl space-y-4">
      <PageTitle title="Email templates" description="{{placeholders}} are filled in automatically. A line like [Button text]({{url}}) becomes a button. Emails use your brand colours." back={{ href: "/admin/settings", label: "Settings" }} />
      {Object.entries(DEFAULT_TEMPLATES).map(([key, def]) => {
        const o = overrides.get(key);
        return (
          <Panel key={key} title={def.description} description={`${key}${o ? " · customised" : ""}`}>
            <details><summary className="cursor-pointer text-sm text-muted-foreground">Edit</summary>
              <ActionForm action={saveTemplateAction} className="mt-3 space-y-3">
                <input type="hidden" name="key" value={key} />
                <Field label="Subject" name="subject" defaultValue={o?.subject ?? def.subject} />
                <TextArea label="Body" name="body" defaultValue={o?.body ?? def.body} rows={8} className="font-mono" />
                <Submit>Save template</Submit>
              </ActionForm>
              {o && <div className="mt-2"><ActionButton action={saveTemplateAction} fields={{ key, op: "reset" }} label="Reset to default" /></div>}
            </details>
          </Panel>
        );
      })}
    </div>
  );
}
