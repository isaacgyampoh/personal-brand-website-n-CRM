"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  forgotPasswordAction, loginAction, magicLinkAction, mfaLoginAction, registerAction, resetPasswordAction,
} from "@/features/authentication/presentation/actions";
import type { ActionResult } from "@/lib/actions";

function Field({ name, label, type = "text", autoComplete, error, defaultValue }: { name: string; label: string; type?: string; autoComplete?: string; error?: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={`a-${name}`} className="field-label">{label}</label>
      <input id={`a-${name}`} name={name} type={type} autoComplete={autoComplete} defaultValue={defaultValue} required className="field" aria-invalid={Boolean(error)} aria-describedby={error ? `a-${name}-e` : undefined} />
      {error && <p id={`a-${name}-e`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Alert({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return <p role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>;
}

function Done({ title, body }: { title: string; body: string }) {
  return <div role="status"><h1 className="display-md">{title}</h1><p className="mt-4 text-[var(--muted-ink)]">{body}</p></div>;
}

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [state, action, pending] = useActionState(loginAction, null);
  const [linkState, linkAction, linkPending] = useActionState(magicLinkAction, null);
  if (linkState?.ok) return <Done title="Check your inbox" body="If that email is linked to any bookings or purchases, a secure sign-in link is on its way. It expires in 30 minutes." />;
  const fe = (s: ActionResult | null, k: string) => (s && !s.ok ? s.fieldErrors?.[k] : undefined);
  return (
    <div>
      <h1 className="display-md">Sign in</h1>
      <div className="mt-8 grid grid-cols-2 border border-[var(--line)] p-1 text-sm" role="tablist">
        {(["password", "link"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-10 font-semibold ${mode === m ? "bg-[var(--ink)] text-[var(--paper)]" : ""}`}>
            {m === "password" ? "Password" : "Email me a link"}
          </button>
        ))}
      </div>
      {mode === "password" ? (
        <form action={action} className="mt-8 space-y-5">
          <input type="hidden" name="next" value={next} />
          <Field name="email" label="Email" type="email" autoComplete="email" error={fe(state, "email")} />
          <Field name="password" label="Password" type="password" autoComplete="current-password" error={fe(state, "password")} />
          <Alert state={state} />
          <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
          <div className="flex justify-between text-sm"><Link href="/forgot-password" className="underline-offset-4 hover:underline">Forgot password?</Link><Link href={`/register?next=${encodeURIComponent(next)}`} className="underline-offset-4 hover:underline">Create account</Link></div>
        </form>
      ) : (
        <form action={linkAction} className="mt-8 space-y-5">
          <input type="hidden" name="next" value={next} />
          <p className="text-sm text-[var(--muted-ink)]">Bought a ticket or course without an account? Enter the same email and we&apos;ll send a secure link to access everything.</p>
          <Field name="email" label="Email" type="email" autoComplete="email" error={fe(linkState, "email")} />
          <Alert state={linkState} />
          <button className="btn btn-primary w-full" disabled={linkPending}>{linkPending ? "Sending…" : "Send sign-in link"}</button>
        </form>
      )}
    </div>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(registerAction, null);
  if (state?.ok) return <Done title="Confirm your email" body="We've sent a verification link. Open it to activate your account, then sign in." />;
  const fe = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  return (
    <form action={action} className="space-y-5">
      <h1 className="display-md">Create your account</h1>
      <p className="text-sm text-[var(--muted-ink)]">Use the same email you booked or purchased with, so everything appears in your portal.</p>
      <Field name="fullName" label="Full name" autoComplete="name" error={fe("fullName")} />
      <Field name="email" label="Email" type="email" autoComplete="email" error={fe("email")} />
      <Field name="password" label="Password (10+ characters)" type="password" autoComplete="new-password" error={fe("password")} />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="acceptTerms" className="mt-0.5 size-4" /> <span>I accept the <Link href="/terms-of-service" className="underline">terms</Link> and <Link href="/privacy-policy" className="underline">privacy policy</Link>.</span></label>
      {fe("acceptTerms") && <p className="text-sm text-red-700">{fe("acceptTerms")}</p>}
      <Alert state={state} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p className="text-sm">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) return <Done title="Check your inbox" body="If an account exists for that email, a reset link is on its way. It expires in 60 minutes." />;
  return (
    <form action={action} className="space-y-5">
      <h1 className="display-md">Reset your password</h1>
      <Field name="email" label="Email" type="email" autoComplete="email" />
      <Alert state={state} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      <p className="text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  if (state?.ok) return <div><Done title="Password updated" body="You can now sign in with your new password." /><Link href="/login" className="btn btn-primary mt-8">Sign in</Link></div>;
  return (
    <form action={action} className="space-y-5">
      <h1 className="display-md">Choose a new password</h1>
      {token && <input type="hidden" name="token" value={token} />}
      <Field name="password" label="New password (10+ characters)" type="password" autoComplete="new-password" />
      <Field name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
      <Alert state={state} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}

export function MfaForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(mfaLoginAction, null);
  return (
    <form action={action} className="space-y-5">
      <h1 className="display-md">Two-factor sign-in</h1>
      <p className="text-sm text-[var(--muted-ink)]">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="a-code" className="field-label">Code</label>
        <input id="a-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={20} className="field tracking-widest" />
      </div>
      <Alert state={state} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Verify"}</button>
      <p className="text-sm"><Link href="/login" className="underline-offset-4 hover:underline">Start again</Link></p>
    </form>
  );
}
