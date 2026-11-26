"use client";

import { ActionForm, Field, Submit } from "@/components/dashboard/forms";
import { reauthAction } from "@/features/integrations/presentation/actions";

/** Password (+ MFA code) confirmation that unlocks sensitive changes for 15 minutes. */
export function ReauthForm({ mfa }: { mfa: boolean }) {
  return (
    <ActionForm action={reauthAction} success="Confirmed" className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="w-full text-sm text-amber-900">For your security, confirm your password before changing credentials. This unlocks sensitive changes for 15 minutes.</p>
      <Field label="Password" name="password" type="password" autoComplete="current-password" required className="min-w-56 flex-1" />
      {mfa && <Field label="Authenticator code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="w-44" />}
      <Submit>Confirm</Submit>
    </ActionForm>
  );
}
