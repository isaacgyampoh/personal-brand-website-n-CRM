import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pendingMfaUserId } from "@/lib/auth/mfa";
import { safeNext } from "@/lib/auth/safe-next";
import { MfaForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Two-factor sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "");
  if (!(await pendingMfaUserId())) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return <MfaForm next={next} />;
}
