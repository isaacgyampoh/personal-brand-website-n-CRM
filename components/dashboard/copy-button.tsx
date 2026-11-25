"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">{done ? "Copied" : label}</button>
  );
}
