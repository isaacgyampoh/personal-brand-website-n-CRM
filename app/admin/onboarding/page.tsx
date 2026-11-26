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
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Get ready to launch" description={`${done} of ${required.length} essential steps done. Each tick comes from your real setup — it can't be skipped by clicking.`} />
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={done} aria-label="Launch readiness">
        <div className="h-full bg-emerald-600" style={{ width: `${(done / required.length) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:bg-muted/50">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-emerald-600 text-white" : "border"}`} aria-hidden>{s.done ? "✓" : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? "text-muted-foreground line-through" : ""}`}>{s.title}{s.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">optional</span>}</span>
                <span className="block text-xs text-muted-foreground">{s.why}</span>
              </span>
              <span className="sr-only">{s.done ? "Done" : "Not done"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
