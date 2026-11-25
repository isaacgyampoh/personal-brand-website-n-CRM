"use client";

import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { toast } from "sonner";
import { stageAction } from "@/features/crm/presentation/actions";

type Stage = { id: string; name: string; color: string; kind: string };
type Card = { id: string; name: string; company: string; stage_id: string; total_spent_minor: number; next_follow_up_at: string | null };

export function PipelineBoard({ stages, contacts, canEdit, currency }: { stages: Stage[]; contacts: Card[]; canEdit: boolean; currency: string }) {
  const [cards, move] = useOptimistic(contacts, (state, { id, stageId }: { id: string; stageId: string }) => state.map((c) => (c.id === id ? { ...c, stage_id: stageId } : c)));
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const money = (m: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(m / 100);

  const moveTo = (id: string, stageId: string) => {
    if (!canEdit) return;
    start(async () => {
      move({ id, stageId });
      const r = await stageAction(id, stageId);
      if (!r.ok) toast.error(r.error);
    });
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3">
        {stages.map((s) => {
          const list = cards.filter((c) => c.stage_id === s.id);
          const shown = s.kind === "open" ? list : list.slice(0, 30);
          return (
            <section
              key={s.id}
              aria-label={s.name}
              className="flex w-72 shrink-0 flex-col rounded-xl border bg-background"
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) moveTo(id, s.id); setDragging(null); }}
            >
              <header className="flex items-center justify-between border-b px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </header>
              <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
                {shown.map((c) => (
                  <li
                    key={c.id}
                    draggable={canEdit}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); setDragging(c.id); }}
                    className={`rounded-lg border bg-background p-3 text-sm shadow-xs ${dragging === c.id ? "opacity-50" : ""} ${canEdit ? "cursor-grab" : ""}`}
                  >
                    <Link href={`/admin/crm/${c.id}`} className="block font-medium hover:underline">{c.name}</Link>
                    {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{c.total_spent_minor ? money(c.total_spent_minor) : ""}</span>
                      {c.next_follow_up_at && <span className={new Date(c.next_follow_up_at) < new Date() ? "font-medium text-red-600" : "text-muted-foreground"}>↻ {new Date(c.next_follow_up_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
                    </div>
                    {canEdit && (
                      <label className="mt-2 block">
                        <span className="sr-only">Move {c.name} to stage</span>
                        <select value={c.stage_id} onChange={(e) => moveTo(c.id, e.target.value)} className="h-8 w-full rounded-md border bg-muted/40 px-2 text-xs">
                          {stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
                {!shown.length && <li className="px-2 py-6 text-center text-xs text-muted-foreground">Drop contacts here</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
