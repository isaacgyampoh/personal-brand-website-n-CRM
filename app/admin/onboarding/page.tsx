import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { onboardingSteps } from "@/features/studio/application/onboarding";
import { PageTitle } from "@/components/dashboard/ui";

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const user = await requireStaffPage("settings:manage", "/admin/onboarding");
  const steps = await onboardingSteps(user.id);
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.optional);
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Get your business ready" description={`${done} of ${required.length} essential steps done. Each tick appears automatically when the step is really finished.`} />
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={done} aria-label="Setup progress">
        <div className="h-full bg-emerald-600" style={{ width: `${(done / required.length) * 100}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">You never need to edit code or server settings. If a step needs details from a provider (Paystack, your email company, Google), the instructions say exactly where to find them.</p>
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.key}>
            <details open={s.key === next?.key} className={`rounded-xl border bg-card ${s.done ? "opacity-80" : ""}`}>
              <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-emerald-600 text-white" : "border"}`} aria-hidden>{s.done ? "✓" : ""}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.title}{s.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">optional</span>}</span>
                  <span className="block text-xs text-muted-foreground">{s.why}</span>
                </span>
                <span className="text-xs text-muted-foreground">{s.done ? "Done" : "To do"}</span>
              </summary>
              <div className="border-t px-4 pb-4 pt-3 pl-14">
                <ol className="list-decimal space-y-1 pl-4 text-sm">{s.how.map((h) => <li key={h}>{h}</li>)}</ol>
                <Link href={s.href} className="mt-3 inline-flex h-9 items-center rounded-lg bg-foreground px-3.5 text-sm font-medium text-background">{s.action}</Link>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
