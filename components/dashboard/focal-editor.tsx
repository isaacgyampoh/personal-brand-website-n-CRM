"use client";

import { useState } from "react";
import { ActionForm, Submit } from "./forms";
import { cropMediaAction, focalPointAction } from "@/features/media/presentation/actions";

/** Click the most important part of the photo; crops keep it in frame. */
export function FocalEditor({ id, url, alt, x, y }: { id: string; url: string; alt: string; x: number; y: number }) {
  const [p, setP] = useState({ x, y });
  return (
    <div className="space-y-2">
      <button type="button" className="relative block w-full cursor-crosshair overflow-hidden rounded-md" aria-label="Set focal point"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setP({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="block w-full" />
        <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500/80 shadow" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
      </button>
      <ActionForm action={focalPointAction} success="Focal point saved" className="inline">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="x" value={p.x.toFixed(4)} /><input type="hidden" name="y" value={p.y.toFixed(4)} />
        <Submit variant="outline" className="h-8 text-xs">Save focal point</Submit>
      </ActionForm>
      <ActionForm action={cropMediaAction} success="Cropped copy added to the library" className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <label className="sr-only" htmlFor={`crop-${id}`}>Crop shape</label>
        <select id={`crop-${id}`} name="aspect" className="h-8 rounded-md border bg-background px-1 text-xs">
          <option value="16:9">16:9 banner</option><option value="1.91:1">Link preview</option><option value="1:1">Square</option><option value="4:5">Portrait 4:5</option><option value="3:4">Portrait 3:4</option>
        </select>
        <Submit variant="outline" className="h-8 text-xs">Create crop</Submit>
      </ActionForm>
      <p className="text-[10px] text-muted-foreground">Save the focal point first; the crop keeps it in frame. The original is kept.</p>
    </div>
  );
}
