"use client";

import { useState } from "react";
import { ActionForm, Submit } from "./forms";
import { MediaPicker } from "./media-picker";
import { saveSettingsAction } from "@/features/website/presentation/admin-actions";

type LinkItem = { label: string; href: string; highlight?: boolean };
export type FieldSpec =
  | { name: string; label: string; type: "text" | "textarea" | "color" | "email" | "datetime-local"; hint?: string }
  | { name: string; label: string; type: "select"; options: [string, string][]; hint?: string }
  | { name: string; label: string; type: "checkbox"; hint?: string }
  | { name: string; label: string; type: "image"; hint?: string }
  | { name: string; label: string; type: "links"; highlight?: boolean; hint?: string }
  | { name: string; label: string; type: "link"; hint?: string }
  | { name: string; label: string; type: "columns"; hint?: string };

function Links({ value, onChange, highlight }: { value: LinkItem[]; onChange: (v: LinkItem[]) => void; highlight?: boolean }) {
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input aria-label="Label" value={l.label} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm" />
          <input aria-label="Link" value={l.href} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} placeholder="/page or https://" className="h-9 min-w-0 flex-[2] rounded-lg border px-2 text-sm" />
          {highlight && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={Boolean(l.highlight)} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, highlight: e.target.checked } : x)))} /> Highlight</label>}
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => { const v = [...value]; [v[i - 1], v[i]] = [v[i], v[i - 1]]; onChange(v); }} className="h-9 px-2 text-xs disabled:opacity-30">↑</button>
          <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="h-9 px-2 text-xs text-red-600">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { label: "", href: "", ...(highlight ? { highlight: false } : {}) }])} className="h-8 rounded-md border px-3 text-xs">+ Add link</button>
    </div>
  );
}

export function SettingsForm({ settingKey, initial, fields, submitLabel = "Save" }: { settingKey: string; initial: Record<string, unknown>; fields: FieldSpec[]; submitLabel?: string }) {
  const [value, setValue] = useState<Record<string, unknown>>(initial);
  const set = (k: string, v: unknown) => setValue((s) => ({ ...s, [k]: v }));
  const cls = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <ActionForm action={saveSettingsAction} className="space-y-5">
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="json" value={JSON.stringify(value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const wide = ["textarea", "links", "columns", "image"].includes(f.type);
          return (
            <div key={f.name} className={wide ? "sm:col-span-2" : ""}>
              {f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value[f.name])} onChange={(e) => set(f.name, e.target.checked)} className="size-4" /> {f.label}</label>
              ) : f.type === "image" ? (
                <ImageUrl label={f.label} value={String(value[f.name] ?? "")} onChange={(v) => set(f.name, v)} />
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground/80">{f.label}</span>
                  {f.type === "textarea" ? <textarea className={cls} rows={3} value={String(value[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
                    : f.type === "select" ? <select className={`${cls} h-9`} value={String(value[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    : f.type === "color" ? <span className="flex items-center gap-2"><input type="color" value={String(value[f.name] ?? "#000000")} onChange={(e) => set(f.name, e.target.value)} className="h-9 w-14 rounded border" /><input className={`${cls} h-9 font-mono`} value={String(value[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} /></span>
                    : f.type === "links" ? <Links value={(value[f.name] as LinkItem[]) ?? []} onChange={(v) => set(f.name, v)} highlight={f.highlight} />
                    : f.type === "link" ? (
                      <span className="flex gap-2">
                        <input className={`${cls} h-9`} placeholder="Label" value={(value[f.name] as LinkItem)?.label ?? ""} onChange={(e) => set(f.name, { ...(value[f.name] as LinkItem), label: e.target.value })} />
                        <input className={`${cls} h-9`} placeholder="/book" value={(value[f.name] as LinkItem)?.href ?? ""} onChange={(e) => set(f.name, { ...(value[f.name] as LinkItem), href: e.target.value })} />
                      </span>
                    )
                    : f.type === "columns" ? <Columns value={(value[f.name] as { title: string; links: LinkItem[] }[]) ?? []} onChange={(v) => set(f.name, v)} />
                    : <input type={f.type} className={`${cls} h-9`} value={String(value[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />}
                </label>
              )}
              {f.hint && <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      <Submit>{submitLabel}</Submit>
    </ActionForm>
  );
}

function ImageUrl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <MediaPicker name="$image" label={label} mode="url" defaultUrl={value} onChange={onChange} />;
}

function Columns({ value, onChange }: { value: { title: string; links: LinkItem[] }[]; onChange: (v: { title: string; links: LinkItem[] }[]) => void }) {
  return (
    <div className="space-y-4">
      {value.map((c, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="mb-2 flex gap-2">
            <input aria-label="Column title" value={c.title} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-9 flex-1 rounded-lg border px-2 text-sm font-medium" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="px-2 text-xs text-red-600">Remove column</button>
          </div>
          <Links value={c.links} onChange={(links) => onChange(value.map((x, j) => (j === i ? { ...x, links } : x)))} />
        </div>
      ))}
      {value.length < 4 && <button type="button" onClick={() => onChange([...value, { title: "New column", links: [] }])} className="h-8 rounded-md border px-3 text-xs">+ Add column</button>}
    </div>
  );
}
