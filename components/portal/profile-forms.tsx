"use client";

import { useActionState } from "react";
import { changePasswordAction, requestDeletionAction, updateProfileAction } from "@/features/portal/presentation/actions";

export function ProfileForms({ email, profile, deletionRequested }: { email: string; profile: { fullName: string; phone: string; timezone: string; sms: boolean; marketing: boolean }; deletionRequested: boolean }) {
  const [s1, a1, p1] = useActionState(updateProfileAction, null);
  const [s2, a2, p2] = useActionState(changePasswordAction, null);
  const [s3, a3, p3] = useActionState(requestDeletionAction, null);
  return (
    <>
      <form action={a1} className="space-y-4">
        <p className="text-sm text-[var(--muted-ink)]">Signed in as <strong>{email}</strong></p>
        <div><label className="field-label" htmlFor="pf-n">Full name</label><input id="pf-n" name="fullName" defaultValue={profile.fullName} className="field" autoComplete="name" /></div>
        <div><label className="field-label" htmlFor="pf-p">Phone</label><input id="pf-p" name="phone" defaultValue={profile.phone} className="field" autoComplete="tel" /></div>
        <div><label className="field-label" htmlFor="pf-t">Time zone</label><input id="pf-t" name="timezone" defaultValue={profile.timezone} className="field" /></div>
        <fieldset className="space-y-2"><legend className="field-label">Notifications</legend>
          <p className="text-sm text-[var(--muted-ink)]">Booking, payment and class emails are always sent.</p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="sms" defaultChecked={profile.sms} /> SMS reminders (where available)</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="marketing" defaultChecked={profile.marketing} /> Newsletter & event announcements</label>
        </fieldset>
        {s1?.ok && <p role="status" className="text-sm">Saved.</p>}{s1 && !s1.ok && <p role="alert" className="text-sm text-red-700">{s1.error}</p>}
        <button className="btn btn-primary" disabled={p1}>Save profile</button>
      </form>
      <form action={a2} className="space-y-3 border-t border-[var(--line)] pt-10">
        <h2 className="display-sm">Password</h2>
        <p className="text-sm text-[var(--muted-ink)]">We&apos;ll email you a secure link to set a new password.</p>
        {s2?.ok && <p role="status" className="text-sm">Check your inbox.</p>}
        <button className="btn btn-outline" disabled={p2}>Email me a reset link</button>
      </form>
      <form action={a3} className="space-y-3 border-t border-[var(--line)] pt-10">
        <h2 className="display-sm">Delete account</h2>
        {deletionRequested || s3?.ok ? <p role="status">Your deletion request has been received. We&apos;ll confirm by email. Payment records are kept as required by law.</p> : (
          <>
            <p className="text-sm text-[var(--muted-ink)]">Removes your personal data. Receipts and payment records are retained for legal accounting purposes. Type DELETE to confirm.</p>
            <input name="confirm" className="field max-w-xs" aria-label="Type DELETE to confirm" />
            {s3 && !s3.ok && <p role="alert" className="text-sm text-red-700">{s3.error}</p>}
            <button className="btn btn-outline" disabled={p3}>Request deletion</button>
          </>
        )}
      </form>
    </>
  );
}
