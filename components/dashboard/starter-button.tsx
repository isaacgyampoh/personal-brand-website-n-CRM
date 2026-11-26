"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { createStarterAssessmentAction } from "@/features/marketing/presentation/assessment-actions";

export function StarterButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button disabled={pending} className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background" onClick={() => start(async () => { const r = await createStarterAssessmentAction(); if (r.ok && r.data) router.push(r.data.redirect); else if (!r.ok) toast.error(r.error); })}>Create from starter template</button>;
}
