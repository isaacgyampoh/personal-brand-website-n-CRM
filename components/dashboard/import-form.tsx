"use client";

import { useActionState } from "react";
import { importAction } from "@/features/crm/presentation/actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importAction, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium">File</span>
        <input type="file" name="file" accept=".csv,.xlsx" required className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Add a tag to every imported contact (optional)</span>
        <input name="tag" className="h-9 w-full rounded-lg border px-3 text-sm" placeholder="e.g. conference-2026" />
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="confirmConsent" className="mt-0.5 size-4" />
        <span>I hold documented marketing consent for rows marked “yes” in the Consent column.<span className="block text-xs text-muted-foreground">If unticked, everyone is imported without marketing consent and won&apos;t receive campaigns until they subscribe.</span></span>
      </label>
      <button disabled={pending} className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60">{pending ? "Importing…" : "Import"}</button>
      {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && state.data && (
        <div role="status" className="rounded-lg border bg-emerald-50 p-4 text-sm">
          <p className="font-medium">{state.data.created} created · {state.data.updated} updated · {state.data.skipped.length} skipped</p>
          {state.data.skipped.length > 0 && <ul className="mt-2 max-h-48 overflow-auto text-xs text-muted-foreground">{state.data.skipped.map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
