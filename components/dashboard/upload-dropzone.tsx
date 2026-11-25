"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { uploadFiles } from "./media-picker";

export function UploadDropzone() {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const res = await uploadFiles(files, { visibility });
      const ok = res.filter((r) => r.ok).length;
      const dup = res.filter((r) => r.ok && (r as { duplicate?: boolean }).duplicate).length;
      const failed = res.filter((r) => !r.ok);
      if (ok) toast.success(`${ok} uploaded${dup ? ` (${dup} already in library)` : ""}`);
      failed.forEach((f) => toast.error(`${f.filename}: ${f.error}`));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files); }}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center ${over ? "border-foreground bg-muted" : "bg-background"}`}
    >
      <p className="text-sm font-medium">{busy ? "Uploading…" : "Drag files here, or"}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background">
          Choose files<input type="file" multiple className="sr-only" onChange={(e) => void handle(e.target.files)} />
        </label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")} className="h-9 rounded-lg border px-2 text-sm" aria-label="Visibility">
          <option value="public">Public (website images)</option>
          <option value="private">Private (paid downloads, recordings)</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG, WebP, AVIF, GIF, PDF, Office, MP3/M4A, MP4. Images up to 15 MB.</p>
    </div>
  );
}
