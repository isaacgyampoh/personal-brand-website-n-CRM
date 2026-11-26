import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { hasRecentAuth } from "@/lib/auth/reauth";
import { mfaStatus, staffMfaRequired } from "@/lib/auth/mfa";
import { db } from "@/lib/database/pool";
import { PageTitle, Panel, Notice } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";
import { ReauthForm } from "@/components/dashboard/reauth-form";
import { MfaSetup, RegenerateCodes } from "@/components/dashboard/mfa-setup";
import { disableMfaAction } from "@/features/authentication/presentation/security-actions";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

/** Account security for staff. Deliberately not behind the MFA gate (this is where MFA is set up). */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const user = await requireUser("/admin/security");
  if (!user.isStaff) redirect("/portal");
  const sp = await searchParams;
  const [mfa, recent, sessions] = await Promise.all([
    mfaStatus(user.id),
    hasRecentAuth(),
    db.query<{ created_at: Date; last_seen_at: Date | null }>(
      "select created_at, last_seen_at from sessions where user_id = $1 and revoked_at is null and expires_at > now() and not mfa_pending order by created_at desc limit 10",
      [user.id],
    ),
  ]);
  const required = staffMfaRequired();
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Security" description="Two-factor authentication protects payments, customer data and integration credentials." />
      {sp.setup && !mfa.enabled && <Notice tone="amber">Set up two-factor authentication to continue using Studio.</Notice>}
      <Panel title="Two-factor authentication">
        {mfa.enabled ? (
          <div className="space-y-3 text-sm">
            <p><strong className="text-emerald-700">On.</strong> You&apos;ll enter a code from your authenticator app when you sign in. {mfa.recoveryCodesLeft} recovery code(s) left.</p>
            {!recent ? <ReauthForm mfa /> : (
              <div className="flex flex-wrap gap-2">
                <RegenerateCodes />
                {!required && <ActionButton action={disableMfaAction} fields={{}} label="Turn off" variant="destructive" confirm="Turn off two-factor authentication?" />}
              </div>
            )}
          </div>
        ) : !recent ? <ReauthForm mfa={false} /> : <MfaSetup />}
      </Panel>
      <Panel title="Signed-in sessions" description="Changing your password signs out every session.">
        <ul className="space-y-1 text-sm">{sessions.map((s, i) => <li key={i}>Started {s.created_at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</li>)}</ul>
      </Panel>
      <Panel title="Lost your phone?">
        <p className="text-sm text-muted-foreground">Sign in with a recovery code. If you have none left, the server administrator can reset two-factor authentication from the server shell (<code>pnpm create-owner --email … --reset-mfa</code>).</p>
      </Panel>
    </div>
  );
}
