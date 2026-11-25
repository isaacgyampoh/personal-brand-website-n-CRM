"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Countdown({ to }: { to: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const diff = Math.max(0, Date.parse(to) - now);
  if (diff === 0) { router.refresh(); }
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  return (
    <div className="mt-5 flex gap-6" role="timer" aria-live="off" aria-label="Time until the class starts">
      {[["days", d], ["hours", h], ["min", m], ["sec", s]].map(([l, v]) => (
        <div key={l as string} className="text-center"><span className="block font-display text-4xl tabular-nums">{String(v).padStart(2, "0")}</span><span className="eyebrow">{l}</span></div>
      ))}
    </div>
  );
}
