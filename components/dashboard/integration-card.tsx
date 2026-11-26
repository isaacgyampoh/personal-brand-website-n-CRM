"use client";

import { useState } from "react";
import { ActionForm, Field, Select, Submit, ActionButton } from "@/components/dashboard/forms";
import { CopyButton } from "@/components/dashboard/copy-button";
import { STATUS_LABEL, storedKey, type FieldDef, type IntegrationDef, type IntegrationStatus } from "@/lib/integrations/definitions";
import {
  disconnectGoogleAction, saveIntegrationAction, sendTestEmailAction, testIntegrationAction, toggleIntegrationAction,
} from "@/features/integrations/presentation/actions";

/** Serialisable view passed from the server. Contains masked hints only — never secret values. */
export type CardView = {
  def: Omit<IntegrationDef, "urls">;
  urls: { label: string; value: string }[];
  enabled: boolean; mode: "test" | "live"; status: IntegrationStatus;
  settings: Record<string, string>; secretHints: Record<string, string>;
  lastSuccessAt: string | null; lastFailureAt: string | null; lastError: string | null;
  googleConnected?: boolean;
  calendars?: { id: string; summary: string; primary: boolean }[] | null;
};

const TONE: Record<IntegrationStatus, string> = {
  connected: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  verification_required: "bg-amber-50 text-amber-800 ring-amber-200",
  incomplete: "bg-amber-50 text-amber-800 ring-amber-200",
  failed: "bg-red-50 text-red-800 ring-red-200",
  disabled: "bg-muted text-foreground/70 ring-border",
  not_configured: "bg-muted text-foreground/70 ring-border",
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");

function FieldInput({ f, mode, v }: { f: FieldDef; mode: "test" | "live"; v: CardView }) {
  const key = storedKey(f, mode);
  const label = `${f.label}${f.perMode ? ` (${mode})` : ""}${f.required ? "" : " — optional"}`;
  const current = v.settings[key] ?? "";
  if (f.type === "secret") {
    const hint = v.secretHints[key];
    return (
      <div>
        <Field label={label} name={`f:${key}`} type="password" autoComplete="new-password" placeholder={hint ? `Saved (${hint}) — leave blank to keep` : f.placeholder} hint={f.help} />
        {hint && (
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" name="clear" value={key} className="size-3.5" /> Remove saved value</label>
        )}
      </div>
    );
  }
  if (f.name === "calendarId" && v.calendars?.length) {
    return <Select label="Calendar" name={`f:${key}`} defaultValue={current} options={v.calendars.map((c) => ({ value: c.primary ? "primary" : c.id, label: `${c.summary}${c.primary ? " (primary)" : ""}` }))} hint="Bookings are added to this calendar and its busy times block availability." />;
  }
  if (f.type === "select") return <Select label={label} name={`f:${key}`} options={f.options ?? []} defaultValue={current} hint={f.help} />;
  if (f.type === "multiselect") {
    const selected = new Set(current.split(",").filter(Boolean));
    return (
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-foreground/80">{label}</legend>
        <input type="hidden" name={`m:${key}`} value="" />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(f.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`m:${key}`} value={o.value} defaultChecked={selected.has(o.value)} className="size-4" />{o.label}</label>
          ))}
        </div>
        {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
      </fieldset>
    );
  }
  if (f.type === "checkbox") {
    return (
      <label className="flex items-start gap-2.5 text-sm">
        <input type="hidden" name={`c:${key}`} value="1" />
        <input type="checkbox" name={`f:${key}`} value="true" defaultChecked={current !== "false"} className="mt-0.5 size-4" />
        <span>{f.label}{f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}</span>
      </label>
    );
  }
  return (
    <Field label={label} name={`f:${key}`} defaultValue={current} placeholder={f.placeholder} hint={f.help}
      type={f.type === "email" ? "email" : f.type === "url" ? "url" : f.type === "number" ? "number" : "text"} inputMode={f.type === "number" ? "numeric" : undefined} />
  );
}

export function IntegrationCard({ v, canGoLive }: { v: CardView; canGoLive: boolean }) {
  const [mode, setMode] = useState<"test" | "live">(v.mode);
  const [open, setOpen] = useState(v.status === "not_configured" ? false : v.status !== "connected");
  const d = v.def;
  return (
    <section id={d.provider} className="scroll-mt-20 rounded-xl border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{d.name} {d.optional && <span className="ml-1 text-xs font-normal text-muted-foreground">optional</span>}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{d.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Last successful test: {fmt(v.lastSuccessAt)} · Last failure: {fmt(v.lastFailureAt)}
            {d.modes && <> · Mode: <strong className={v.mode === "live" ? "text-red-700" : ""}>{v.mode === "live" ? "LIVE" : "Test"}</strong></>}
          </p>
          {v.status === "failed" && v.lastError && <p className="mt-1 text-xs text-red-700">{v.lastError}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE[v.status]}`} data-testid={`status-${d.provider}`}>{STATUS_LABEL[v.status]}</span>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`body-${d.provider}`} className="h-8 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">{open ? "Close" : "Configure"}</button>
        </div>
      </header>

      {open && (
        <div id={`body-${d.provider}`} className="space-y-5 border-t p-4 sm:p-5">
          <details className="rounded-lg bg-muted/50 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Setup instructions</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">{d.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {d.docs && <p className="mt-2"><a href={d.docs} target="_blank" rel="noreferrer noopener" className="underline">Provider documentation</a></p>}
          </details>

          {v.urls.length > 0 && (
            <ul className="space-y-2">
              {v.urls.map((u) => (
                <li key={u.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="w-48 shrink-0 text-xs font-medium">{u.label}</span>
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{u.value}</code>
                  <CopyButton text={u.value} />
                </li>
              ))}
            </ul>
          )}

          <ActionForm action={saveIntegrationAction} success="Saved" className="space-y-4">
            <input type="hidden" name="provider" value={d.provider} />
            {d.modes && (
              <fieldset className="flex flex-wrap items-center gap-4">
                <legend className="mb-1 text-xs font-medium">Mode</legend>
                {(["test", "live"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} disabled={m === "live" && !canGoLive && v.mode !== "live"} />
                    {m === "test" ? "Test" : "Live"}
                  </label>
                ))}
                {!canGoLive && <span className="text-xs text-muted-foreground">Live mode is locked until the server operator approves go-live. You can still save live keys below.</span>}
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {d.fields.filter((f) => !f.perMode).map((f) => <FieldInput key={f.name} f={f} mode={mode} v={v} />)}
            </div>
            {d.modes && (["test", "live"] as const).map((m) => (
              <fieldset key={m} className={`rounded-lg border p-3 ${m === mode ? "" : "opacity-70"}`}>
                <legend className="px-1 text-xs font-medium">{m === "test" ? "Test keys" : "Live keys"}{m === mode ? " (active)" : ""}</legend>
                <div className="grid gap-4 sm:grid-cols-2">{d.fields.filter((f) => f.perMode).map((f) => <FieldInput key={f.name} f={f} mode={m} v={v} />)}</div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2"><Submit>Save</Submit></div>
          </ActionForm>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <ActionButton action={testIntegrationAction} fields={{ provider: d.provider }} label="Test connection" variant="default" success="Connection verified" />
            <ActionButton action={toggleIntegrationAction} fields={{ provider: d.provider, enabled: String(!v.enabled) }} label={v.enabled ? "Disable" : "Enable"}
              confirm={!v.enabled && v.mode === "live" ? `Enable ${d.name} in LIVE mode? Real money will be charged.` : undefined} />
            {d.provider === "google" && (v.googleConnected
              ? <ActionButton action={disconnectGoogleAction} fields={{}} label="Disconnect Google" variant="destructive" confirm="Disconnect Google Calendar? Existing calendar entries stay, but new bookings won't sync." />
              // Full-page navigation is required: this route redirects to Google's OAuth consent screen.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              : <a href="/api/integrations/google/connect" className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">Connect Google account</a>)}
          </div>

          {d.provider === "smtp" && (
            <ActionForm action={sendTestEmailAction} success="Sent" className="flex flex-wrap items-end gap-2">
              <Field label="Send a test email to" name="to" type="email" className="min-w-60 flex-1" />
              <Submit variant="outline">Send test email</Submit>
            </ActionForm>
          )}
        </div>
      )}
    </section>
  );
}
