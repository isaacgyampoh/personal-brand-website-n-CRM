"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RichEditor } from "./rich-editor";
import { MediaPicker } from "@/components/dashboard/media-picker";
import { articleStatusAction, saveArticleAction } from "@/features/content/presentation/actions";

type Article = {
  id: string | null; title: string; slug: string; excerpt: string; body: unknown; coverMediaId: string | null; videoUrl: string; categoryId: string | null;
  tags: string[]; authorName: string; featured: boolean; seoTitle: string; seoDescription: string; status: string; scheduledFor: string;
};

export function ArticleEditor({ initial, categories, canPublish, aiEnabled }: { initial: Article; categories: { id: string; name: string }[]; canPublish: boolean; aiEnabled: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [id, setId] = useState(initial.id);
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const [pending, start] = useTransition();
  const dirty = useRef(false);
  const set = <K extends keyof Article>(k: K, v: Article[K]) => { setA((x) => ({ ...x, [k]: v })); dirty.current = true; setState("dirty"); };

  const save = async (quiet = false) => {
    if (!a.title.trim()) { if (!quiet) toast.error("Add a title first"); return null; }
    setState("saving");
    const r = await saveArticleAction(id, { ...a, tags: a.tags, coverMediaId: a.coverMediaId || null, categoryId: a.categoryId || null });
    if (r.ok && r.data) {
      dirty.current = false;
      setState("saved");
      if (!id) { setId(r.data.id); router.replace(`/admin/content/${r.data.id}`); }
      if (!quiet) toast.success("Saved");
      return r.data.id;
    }
    setState("dirty");
    if (!r.ok) toast.error(r.error);
    return null;
  };

  // Autosave every 20s when there are unsaved changes.
  useEffect(() => {
    const t = setInterval(() => { if (dirty.current) void save(true); }, 20_000);
    return () => clearInterval(t);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const status = (action: "publish" | "unpublish" | "archive" | "schedule") => start(async () => {
    const saved = await save(true);
    if (!saved) return;
    const r = await articleStatusAction(saved, action, a.scheduledFor);
    if (r.ok) { toast.success(action === "publish" ? "Published" : action === "schedule" ? "Scheduled" : "Updated"); router.refresh(); } else toast.error(r.error);
  });

  const input = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <input value={a.title} onChange={(e) => set("title", e.target.value)} placeholder="Article title" aria-label="Title" className="w-full border-0 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60" />
        <textarea value={a.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="Short excerpt shown on cards and in search results" aria-label="Excerpt" rows={2} className={input} />
        <RichEditor value={a.body} onChange={(doc) => set("body", doc)} />
      </div>
      <aside className="space-y-4">
        <div className="sticky top-4 space-y-4">
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground" aria-live="polite">Status: <span className="font-medium capitalize text-foreground">{a.status}</span> · {state === "saving" ? "Saving…" : state === "dirty" ? "Unsaved changes" : "All changes saved"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void save()} className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted">Save draft</button>
              {canPublish && <button type="button" disabled={pending} onClick={() => status("publish")} className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background">{a.status === "published" ? "Update live" : "Publish"}</button>}
              {canPublish && a.status === "published" && <button type="button" disabled={pending} onClick={() => status("unpublish")} className="h-9 rounded-lg border px-3 text-sm">Unpublish</button>}
            </div>
            {canPublish && a.status !== "published" && (
              <div className="mt-3 flex gap-2">
                <input type="datetime-local" value={a.scheduledFor} onChange={(e) => set("scheduledFor", e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm" aria-label="Schedule time" />
                <button type="button" disabled={pending || !a.scheduledFor} onClick={() => status("schedule")} className="h-9 rounded-lg border px-3 text-sm">Schedule</button>
              </div>
            )}
            {id && a.status === "published" && <a href={`/insights/${a.slug}`} target="_blank" rel="noreferrer" className="mt-3 block text-xs underline">View live ↗</a>}
          </div>
          <div className="space-y-3 rounded-xl border bg-background p-4 text-sm">
            <label className="block"><span className="text-xs font-medium">URL slug</span><input className={input} value={a.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto from title" /></label>
            <label className="block"><span className="text-xs font-medium">Category</span>
              <select className={`${input} h-9`} value={a.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}><option value="">None</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="block"><span className="text-xs font-medium">Tags (comma-separated)</span><input className={input} value={a.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} /></label>
            <label className="block"><span className="text-xs font-medium">Author</span><input className={input} value={a.authorName} onChange={(e) => set("authorName", e.target.value)} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={a.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured article</label>
            <MediaPicker name="cover" label="Cover image" defaultId={a.coverMediaId ?? ""} onChange={(v) => set("coverMediaId", v || null)} />
            <label className="block"><span className="text-xs font-medium">Video (YouTube/Vimeo URL)</span><input className={input} value={a.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} /></label>
          </div>
          <div className="space-y-3 rounded-xl border bg-background p-4 text-sm">
            <p className="font-medium">SEO & sharing</p>
            <label className="block"><span className="text-xs">SEO title <span className="text-muted-foreground">({a.seoTitle.length}/80)</span></span><input className={input} maxLength={80} value={a.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></label>
            <label className="block"><span className="text-xs">Meta description <span className="text-muted-foreground">({a.seoDescription.length}/300)</span></span><textarea className={input} rows={3} maxLength={300} value={a.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></label>
          </div>
          {aiEnabled && <a href={`/admin/ai?task=headline&context=${encodeURIComponent(a.title)}`} className="block rounded-xl border bg-background p-4 text-sm hover:bg-muted">✦ Get headline ideas with the AI assistant</a>}
        </div>
      </aside>
    </div>
  );
}
