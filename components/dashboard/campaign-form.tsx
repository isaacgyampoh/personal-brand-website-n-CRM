import { ActionForm, Field, Select, Submit, TextArea } from "./forms";
import { saveCampaignAction } from "@/features/marketing/presentation/actions";

export function CampaignForm({ c, lists, tags }: { c?: { id: string; name: string; subject: string; preheader: string; body: string; audience: { type: string; listId?: string; tagId?: string } }; lists: { id: string; name: string }[]; tags: { id: string; name: string }[] }) {
  const aud = c?.audience;
  return (
    <ActionForm action={saveCampaignAction} className="grid gap-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Internal name" name="name" defaultValue={c?.name} required />
      <Field label="Subject line" name="subject" defaultValue={c?.subject} required />
      <Field label="Preview text" name="preheader" defaultValue={c?.preheader} />
      <TextArea label="Email body — blank line = new paragraph, {{name}} = first name, [Button text](https://link) on its own line = button" name="body" defaultValue={c?.body} rows={14} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Audience" name="audienceType" defaultValue={aud?.type ?? "all_subscribers"} options={[["all_subscribers", "All confirmed subscribers"], ["list", "A mailing list"], ["tag", "Subscribers with a CRM tag"]] as const} />
        <Select label="List or tag (if chosen)" name="audienceId" defaultValue={aud?.listId ?? aud?.tagId ?? ""} options={[{ value: "", label: "—" }, ...lists.map((l) => ({ value: l.id, label: `List: ${l.name}` })), ...tags.map((t) => ({ value: t.id, label: `Tag: ${t.name}` }))]} />
      </div>
      <p className="text-xs text-muted-foreground">Only subscribers who confirmed by double opt-in are included; unsubscribed and bounced addresses are always excluded. Every email has an unsubscribe link.</p>
      <div><Submit>Save campaign</Submit></div>
    </ActionForm>
  );
}
