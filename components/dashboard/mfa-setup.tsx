"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { beginMfaAction, confirmMfaAction, regenerateCodesAction } from "@/features/authentication/presentation/security-actions";
import { CopyButton } from "@/components/dashboard/copy-button";

function Codes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-medium text-emerald-900">Save these recovery codes somewhere safe (a password manager). Each works once if you lose your phone. They won&apos;t be shown again.</p>
      <ul data-testid="recovery-codes" className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="mt-3"><CopyButton text={codes.join("\n")} label="Copy codes" /></div>
    </div>
  );
}

export function MfaSetup() {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [pending, start] = useTransition();
  const [state, confirm, confirming] = useActionState(confirmMfaAction, null);
  if (state?.ok && state.data) return <Codes codes={state.data.codes} />;
  if (!setup) {
    return (
      <button type="button" disabled={pending} className="h-9 rounded-lg bg-foreground px-3.5 text-sm font-medium text-background disabled:opacity-60"
        onClick={() => start(async () => { const r = await beginMfaAction(); if (r.ok && r.data) setSetup(r.data); else if (!r.ok) toast.error(r.error); })}>
        {pending ? "Preparing…" : "Set up two-factor authentication"}
      </button>
    );
  }
  const grouped = setup.secret.match(/.{1,4}/g)?.join(" ") ?? setup.secret;
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or Authy).</li>
        <li>On this phone, <a href={setup.uri} className="font-medium underline">tap here to add the account</a>, or choose &quot;Enter a setup key&quot; in the app and type:
          <div className="mt-2 flex items-center gap-2"><code data-testid="mfa-secret" className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">{grouped}</code><CopyButton text={setup.secret} /></div>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <form action={confirm} className="flex flex-wrap items-end gap-2">
        <label className="block"><span className="mb-1 block text-xs font-medium">Code</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="h-9 w-36 rounded-lg border bg-background px-3 text-sm tracking-widest" /></label>
        <button disabled={confirming} className="h-9 rounded-lg bg-foreground px-3.5 text-sm font-medium text-background disabled:opacity-60">{confirming ? "Checking…" : "Turn on"}</button>
      </form>
      {state && !state.ok && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </div>
  );
}

export function RegenerateCodes() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  if (codes) return <Codes codes={codes} />;
  return (
    <button type="button" disabled={pending} className="h-8 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
      onClick={() => { if (window.confirm("Create new recovery codes? Old codes stop working.")) start(async () => { const r = await regenerateCodesAction(); if (r.ok && r.data) setCodes(r.data.codes); else if (!r.ok) toast.error(r.error); }); }}>
      {pending ? "Working…" : "New recovery codes"}
    </button>
  );
}
