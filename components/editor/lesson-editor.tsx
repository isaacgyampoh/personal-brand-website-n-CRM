"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RichEditor } from "./rich-editor";
import { MediaPicker } from "@/components/dashboard/media-picker";
import { saveLessonAction, saveQuizAction } from "@/features/academy/presentation/admin-actions";

type Q = { id: string; prompt: string; multiple?: boolean; options: { id: string; label: string; correct: boolean }[] };
const rid = () => Math.random().toString(36).slice(2, 8);

export function LessonEditor({ courseId, modules, initial, quiz }: {
  courseId: string; modules: { id: string; title: string }[];
  initial: { id: string; moduleId: string; title: string; kind: string; body: unknown; videoProvider: string; videoRef: string; mediaId: string; durationMinutes: number; isPreview: boolean; releaseAfterDays: number | "" };
  quiz: { passPercent: number; maxAttempts: number | null; questions: unknown[] } | null;
}) {
  const router = useRouter();
  const [l, setL] = useState(initial);
  const [questions, setQuestions] = useState<Q[]>((quiz?.questions as Q[]) ?? []);
  const [pass, setPass] = useState(quiz?.passPercent ?? 70);
  const [maxAttempts, setMaxAttempts] = useState<number | "">(quiz?.maxAttempts ?? "");
  const [pending, start] = useTransition();
  const input = "h-9 w-full rounded-lg border bg-background px-3 text-sm";

  const save = () => start(async () => {
    const r = await saveLessonAction({ ...l, courseId });
    if (!r.ok) { toast.error(r.error); return; }
    if (l.kind === "quiz" && questions.length) {
      const q = await saveQuizAction(r.data!.id, { passPercent: pass, maxAttempts: maxAttempts === "" ? null : maxAttempts, questions });
      if (!q.ok) { toast.error(q.error); return; }
    }
    toast.success("Lesson saved");
    if (!l.id) router.replace(`/admin/academy/${courseId}/lessons/${r.data!.id}`);
    else router.refresh();
  });

  return (
    <div className="space-y-5 rounded-xl border bg-background p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="text-xs font-medium">Title</span><input className={input} value={l.title} onChange={(e) => setL({ ...l, title: e.target.value })} /></label>
        <label className="block"><span className="text-xs font-medium">Module</span><select className={input} value={l.moduleId} onChange={(e) => setL({ ...l, moduleId: e.target.value })}>{modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
        <label className="block"><span className="text-xs font-medium">Type</span><select className={input} value={l.kind} onChange={(e) => setL({ ...l, kind: e.target.value })}>{["text", "video", "audio", "download", "quiz", "assignment"].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="block"><span className="text-xs font-medium">Duration (minutes)</span><input type="number" className={input} value={l.durationMinutes} onChange={(e) => setL({ ...l, durationMinutes: Number(e.target.value) })} /></label>
        <label className="block"><span className="text-xs font-medium">Unlock after (days from enrolment)</span><input type="number" className={input} value={l.releaseAfterDays} onChange={(e) => setL({ ...l, releaseAfterDays: e.target.value === "" ? "" : Number(e.target.value) })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.isPreview} onChange={(e) => setL({ ...l, isPreview: e.target.checked })} /> Free preview (visible before purchase)</label>
      </div>
      {(l.kind === "video" || l.kind === "audio") && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <label className="block"><span className="text-xs font-medium">Source</span>
            <select className={input} value={l.videoProvider} onChange={(e) => setL({ ...l, videoProvider: e.target.value })}>
              <option value="">Uploaded file (private, signed links)</option><option value="youtube_unlisted">YouTube (unlisted)</option><option value="vimeo">Vimeo (private/domain-restricted)</option>
            </select>
          </label>
          {l.videoProvider ? <label className="block"><span className="text-xs font-medium">Video ID</span><input className={input} value={l.videoRef} onChange={(e) => setL({ ...l, videoRef: e.target.value })} placeholder="e.g. dQw4w9WgXcQ or 123456789" /></label>
            : <MediaPicker name="lessonMedia" label="Media file" kind="file" visibility="private" defaultId={l.mediaId} onChange={(v) => setL({ ...l, mediaId: v })} />}
          <p className="text-xs text-muted-foreground sm:col-span-2">Uploaded videos are served through short-lived signed URLs. For large libraries, a dedicated video host (Vimeo/Bunny) is recommended over R2 for streaming.</p>
        </div>
      )}
      <div><span className="text-xs font-medium">Lesson content</span><RichEditor value={l.body} onChange={(body) => setL({ ...l, body })} /></div>
      {l.kind === "quiz" && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap gap-4">
            <label className="block"><span className="text-xs font-medium">Pass mark %</span><input type="number" className={input} value={pass} onChange={(e) => setPass(Number(e.target.value))} /></label>
            <label className="block"><span className="text-xs font-medium">Max attempts (blank = unlimited)</span><input type="number" className={input} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value === "" ? "" : Number(e.target.value))} /></label>
          </div>
          {questions.map((q, qi) => (
            <fieldset key={q.id} className="space-y-2 rounded-lg bg-muted/40 p-3">
              <div className="flex gap-2"><input className={input} value={q.prompt} placeholder={`Question ${qi + 1}`} onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)))} /><button type="button" className="text-xs text-red-600" onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))}>Remove</button></div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(q.multiple)} onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, multiple: e.target.checked } : x)))} /> Multiple correct answers</label>
              {q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type="checkbox" aria-label="Correct answer" checked={o.correct} onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, options: x.options.map((y) => (y.id === o.id ? { ...y, correct: e.target.checked } : x.multiple ? y : { ...y, correct: false })) } : x)))} />
                  <input className={input} value={o.label} placeholder="Answer" onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, options: x.options.map((y) => (y.id === o.id ? { ...y, label: e.target.value } : y)) } : x)))} />
                </div>
              ))}
              <button type="button" className="text-xs underline" onClick={() => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, options: [...x.options, { id: rid(), label: "", correct: false }] } : x)))}>+ Answer</button>
            </fieldset>
          ))}
          <button type="button" className="h-8 rounded-md border px-3 text-xs" onClick={() => setQuestions([...questions, { id: rid(), prompt: "", options: [{ id: rid(), label: "", correct: true }, { id: rid(), label: "", correct: false }] }])}>+ Question</button>
        </div>
      )}
      <button type="button" onClick={save} disabled={pending} className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background">{pending ? "Saving…" : "Save lesson"}</button>
    </div>
  );
}
