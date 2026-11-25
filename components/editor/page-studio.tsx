"use client";

import "@puckeditor/core/no-external.css";
import { Puck, type Data } from "@puckeditor/core";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildPuckConfig } from "@/features/website-builder/presentation/puck-config";
import { publishPageAction, saveDraftAction, schedulePageAction } from "@/features/website/presentation/admin-actions";

type Seo = { title?: string; description?: string; ogImageUrl?: string; noindex?: boolean; canonical?: string };

export function PageStudio({ page, canPublish, rootClassName, themeCss, timezone }: {
  page: { id: string; title: string; slug: string; kind: string; status: string; draft: unknown; seo: Seo; scheduledFor: string; requiresLegalReview: boolean };
  canPublish: boolean; rootClassName: string; themeCss: string; timezone: string;
}) {
  const config = useMemo(() => buildPuckConfig(rootClassName, themeCss), [rootClassName, themeCss]);
  const [seo, setSeo] = useState<Seo>(page.seo ?? {});
  const [panel, setPanel] = useState<"none" | "seo" | "schedule">("none");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [when, setWhen] = useState(page.scheduledFor);
  const latest = useRef<Data>(page.draft as Data);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (data: Data, quiet = false) => {
    setSaving("saving");
    const r = await saveDraftAction(page.id, data, seo);
    setSaving(r.ok ? "saved" : "error");
    if (!r.ok) toast.error(r.error);
    else if (!quiet) toast.success("Draft saved — not yet live");
  }, [page.id, seo]);

  const onChange = (data: Data) => {
    latest.current = data;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(data, true), 2500); // autosave
  };

  const publish = async () => {
    if (page.requiresLegalReview && !confirm("This legal page is marked as requiring legal review. Publish anyway?")) return;
    setSaving("saving");
    const r = await publishPageAction(page.id, latest.current, seo);
    setSaving(r.ok ? "saved" : "error");
    if (r.ok) toast.success("Published — live on the website now");
    else toast.error(r.error);
  };

  const schedule = async () => {
    const r = await schedulePageAction(page.id, latest.current, seo, when);
    if (r.ok) { toast.success(`Scheduled for ${when.replace("T", " ")} (${timezone})`); setPanel("none"); } else toast.error(r.error);
  };

  const publicPath = page.slug === "home" ? "/" : `/${page.slug}`;
  const btn = "inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-neutral-100";

  return (
    <div className="h-dvh font-sans">
      <Puck
        config={config}
        data={page.draft as Data}
        onChange={onChange}
        onPublish={() => void publish()}
        headerTitle={page.title}
        headerPath={publicPath}
        viewports={[{ width: 390, label: "Mobile", icon: "Smartphone" }, { width: 820, label: "Tablet", icon: "Tablet" }, { width: 1440, label: "Desktop", icon: "Monitor" }]}
        renderHeaderActions={() => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500" aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Draft saved" : saving === "error" ? "Not saved" : ""}</span>
            <Link href="/admin/website" className={btn}>← Pages</Link>
            <button type="button" className={btn} onClick={() => setPanel(panel === "seo" ? "none" : "seo")}>SEO & sharing</button>
            <a href={`/studio/${page.id}/preview`} target="_blank" rel="noreferrer" className={btn}>Preview draft ↗</a>
            <button type="button" className={btn} onClick={() => void save(latest.current)}>Save draft</button>
            {canPublish && <button type="button" className={btn} onClick={() => setPanel(panel === "schedule" ? "none" : "schedule")}>Schedule</button>}
            {canPublish && <button type="button" onClick={() => void publish()} className="inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-700">Publish</button>}
          </div>
        )}
      />
      {panel !== "none" && (
        <div className="fixed right-4 top-16 z-[1000] w-[min(92vw,380px)] rounded-xl border bg-white p-4 text-sm shadow-2xl" role="dialog" aria-label={panel === "seo" ? "SEO settings" : "Schedule publishing"}>
          {panel === "seo" ? (
            <div className="space-y-3">
              <p className="font-semibold">SEO & social preview</p>
              <label className="block">Title<input className="mt-1 h-9 w-full rounded border px-2" maxLength={80} value={seo.title ?? ""} onChange={(e) => setSeo({ ...seo, title: e.target.value })} /></label>
              <label className="block">Description<textarea className="mt-1 w-full rounded border px-2 py-1" rows={3} maxLength={300} value={seo.description ?? ""} onChange={(e) => setSeo({ ...seo, description: e.target.value })} /></label>
              <label className="block">Social image URL<input className="mt-1 h-9 w-full rounded border px-2" value={seo.ogImageUrl ?? ""} onChange={(e) => setSeo({ ...seo, ogImageUrl: e.target.value })} placeholder="/media/… or https://…" /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(seo.noindex)} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /> Hide from search engines</label>
              <div className="flex justify-end gap-2"><button className={btn} onClick={() => setPanel("none")}>Close</button><button className="h-8 rounded-md bg-neutral-900 px-3 text-xs text-white" onClick={() => void save(latest.current)}>Save</button></div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold">Schedule publishing</p>
              <p className="text-xs text-neutral-500">The current draft goes live automatically at this time ({timezone}). The background worker must be running.</p>
              <input type="datetime-local" className="h-9 w-full rounded border px-2" value={when} onChange={(e) => setWhen(e.target.value)} />
              <div className="flex justify-end gap-2"><button className={btn} onClick={() => setPanel("none")}>Cancel</button><button className="h-8 rounded-md bg-neutral-900 px-3 text-xs text-white" onClick={() => void schedule()}>Schedule</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
