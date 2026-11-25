import { ActionForm, Check, Field, Select, Submit } from "./forms";
import type { ActionResult } from "@/lib/actions";

type Stage = { id: string; name: string };
type Contact = {
  id?: string; full_name?: string; email?: string | null; phone?: string | null; company?: string; job_title?: string;
  lifecycle?: string; stage_id?: string | null; source?: string; consent_marketing?: boolean; next_follow_up_at?: Date | null;
};

import { toLocalInput } from "@/lib/time";

export function ContactForm({ action, stages, contact = {}, submitLabel = "Save", tz = "Africa/Accra" }: {
  tz?: string;
  action: (p: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>; stages: Stage[]; contact?: Contact; submitLabel?: string;
}) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      {contact.id && <input type="hidden" name="id" value={contact.id} />}
      <Field label="Full name" name="fullName" defaultValue={contact.full_name ?? ""} autoComplete="off" />
      <Field label="Email" name="email" type="email" defaultValue={contact.email ?? ""} />
      <Field label="Phone" name="phone" defaultValue={contact.phone ?? ""} />
      <Field label="Company" name="company" defaultValue={contact.company ?? ""} />
      <Field label="Job title" name="jobTitle" defaultValue={contact.job_title ?? ""} />
      <Field label="Source" name="source" defaultValue={contact.source ?? "manual"} hint="e.g. linkedin, referral, event" />
      <Select label="Type" name="lifecycle" defaultValue={contact.lifecycle ?? "lead"} options={[["lead", "Lead"], ["customer", "Customer"], ["partner", "Partner"]] as const} />
      <Select label="Pipeline stage" name="stageId" defaultValue={contact.stage_id ?? ""} options={[{ value: "", label: "—" }, ...stages.map((s) => ({ value: s.id, label: s.name }))]} />
      <Field label="Next follow-up" name="nextFollowUpAt" type="datetime-local" defaultValue={toLocalInput(contact.next_follow_up_at, tz)} />
      <Check className="sm:col-span-2" label="Has given marketing consent" name="consentMarketing" defaultChecked={contact.consent_marketing} hint="Only tick if the person explicitly agreed to receive marketing emails. The date and source are recorded." />
      <div className="sm:col-span-2"><Submit>{submitLabel}</Submit></div>
    </ActionForm>
  );
}
