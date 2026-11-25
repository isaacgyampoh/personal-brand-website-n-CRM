"use client";

import { useCallback, useEffect, useState } from "react";

export type MediaItem = { id: string; filename: string; url: string | null; mime: string; visibility?: string; alt?: string };

export async function uploadFiles(files: FileList | File[], opts: { visibility?: "public" | "private"; alt?: string; category?: string } = {}) {
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("file", f);
  fd.append("visibility", opts.visibility ?? "public");
  if (opts.alt) fd.append("alt", opts.alt);
  if (opts.category) fd.append("category", opts.category);
  const res = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
  const body = (await res.json()) as { results?: { ok: boolean; asset?: MediaItem; error?: string; filename?: string }[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Upload failed");
  return body.results ?? [];
}

/** Browse/upload dialog. Returns the chosen asset. */
export function MediaDialog({ open, onClose, onSelect, kind = "image", visibility = "public" }: {
  open: boolean; onClose: () => void; onSelect: (m: MediaItem) => void; kind?: "image" | "file"; visibility?: "public" | "private";
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/media?kind=${kind}&visibility=${visibility}&q=${encodeURIComponent(q)}`);
    if (res.ok) setItems(((await res.json()) as { items: MediaItem[] }).items);
  }, [kind, visibility, q]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Media library">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <p className="font-semibold">Media library</p>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-40 rounded-lg border px-3 text-sm" aria-label="Search media" />
            <label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-foreground px-3 text-sm font-medium text-background">
              {busy ? "Uploading…" : "Upload"}
              <input type="file" className="sr-only" multiple accept={kind === "image" ? "image/jpeg,image/png,image/webp,image/avif,image/gif" : undefined}
                onChange={async (e) => {
                  if (!e.target.files?.length) return;
                  setBusy(true); setErr(null);
                  try {
                    const res = await uploadFiles(e.target.files, { visibility });
                    const failed = res.filter((r) => !r.ok);
                    if (failed.length) setErr(failed.map((f) => `${f.filename}: ${f.error}`).join("; "));
                    const first = res.find((r) => r.ok)?.asset;
                    await load();
                    if (first && res.length === 1) onSelect(first);
                  } catch (x) { setErr((x as Error).message); } finally { setBusy(false); e.target.value = ""; }
                }} />
            </label>
            <button onClick={onClose} className="h-9 rounded-lg border px-3 text-sm">Close</button>
          </div>
        </div>
        {err && <p role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">{err}</p>}
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-5">
          {items.map((m) => (
            <button key={m.id} type="button" onClick={() => onSelect(m)} className="group overflow-hidden rounded-lg border text-left hover:ring-2 hover:ring-foreground">
              {m.mime.startsWith("image/") && m.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
              ) : <div className="flex aspect-square items-center justify-center bg-muted text-xs font-semibold uppercase text-muted-foreground">{m.mime.split("/")[1]?.slice(0, 6)}</div>}
              <p className="truncate px-2 py-1.5 text-xs">{m.filename}</p>
            </button>
          ))}
          {!items.length && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No files yet. Upload one to get started.</p>}
        </div>
      </div>
    </div>
  );
}

/** Form field that stores a media asset id (or URL) in a hidden input. */
export function MediaPicker({ name, label, defaultId = "", defaultUrl = "", mode = "id", kind = "image", visibility = "public" }: {
  name: string; label: string; defaultId?: string; defaultUrl?: string; mode?: "id" | "url"; kind?: "image" | "file"; visibility?: "public" | "private";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(mode === "id" ? defaultId : defaultUrl);
  const [preview, setPreview] = useState<string | null>(defaultUrl || null);
  const [fileName, setFileName] = useState<string | null>(null);
  useEffect(() => {
    if (mode === "id" && defaultId && !preview) {
      fetch(`/api/admin/media/${defaultId}`).then((r) => (r.ok ? r.json() : null)).then((m: MediaItem | null) => { if (m) { setPreview(m.url); setFileName(m.filename); } });
    }
  }, [mode, defaultId, preview]);
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-3">
        {preview && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-16 rounded-md border object-cover" />
        ) : <div className="flex size-16 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">{fileName ? "FILE" : "None"}</div>}
        <div className="flex flex-col gap-1 text-sm">
          {fileName && <span className="max-w-60 truncate text-xs text-muted-foreground">{fileName}</span>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted">{value ? "Change" : "Choose"}</button>
            {value && <button type="button" onClick={() => { setValue(""); setPreview(null); setFileName(null); }} className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">Remove</button>}
          </div>
        </div>
      </div>
      <MediaDialog open={open} kind={kind} visibility={visibility} onClose={() => setOpen(false)} onSelect={(m) => {
        setValue(mode === "id" ? m.id : m.url ?? "");
        setPreview(m.url);
        setFileName(m.filename);
        setOpen(false);
      }} />
    </div>
  );
}
