"use client";

import { useState, useTransition } from "react";
import { generateDraftAction } from "@/features/ai/presentation/actions";
import { CopyButton } from "./copy-button";

export function AiAssistant({ tasks, initialTask, initialBrief }: { tasks: [string, string][]; initialTask: string; initialBrief: string }) {
  const [task, setTask] = useState(initialTask);
  const [tone, setTone] = useState("warm");
  const [brief, setBrief] = useState(initialBrief);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cls = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-4 rounded-xl border bg-background p-5" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => {
        const r = await generateDraftAction({ task, brief, tone });
        if (r.ok && r.data) setDraft(r.data.text); else if (!r.ok) setError(r.error);
      }); }}>
        <label className="block"><span className="text-xs font-medium">What do you need?</span><select className={`${cls} h-9`} value={task} onChange={(e) => setTask(e.target.value)}>{tasks.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="block"><span className="text-xs font-medium">Tone</span><select className={`${cls} h-9`} value={tone} onChange={(e) => setTone(e.target.value)}>{["warm", "authoritative", "conversational", "inspiring", "concise"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="text-xs font-medium">Brief, notes or text to work from</span><textarea className={cls} rows={10} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Announce my 5 December LinkedIn Authority masterclass for mid-career professionals in Accra…" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={pending || brief.trim().length < 3} className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60">{pending ? "Drafting… (this can take a little while)" : "Generate draft"}</button>
      </form>
      <div className="space-y-3 rounded-xl border bg-background p-5">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold">Draft (editable)</p>{draft && <CopyButton text={draft} />}</div>
        <textarea aria-label="Draft" className={`${cls} min-h-[24rem]`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your draft appears here." />
        <p className="text-xs text-muted-foreground">Paste into the content calendar, an article, a campaign or LinkedIn yourself after reviewing.</p>
      </div>
    </div>
  );
}
