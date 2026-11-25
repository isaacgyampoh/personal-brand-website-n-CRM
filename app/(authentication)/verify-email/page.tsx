import type { Metadata } from "next";
import Link from "next/link";
import { authProvider } from "@/lib/auth/session";
import { attachVerifiedUser } from "@/features/crm/application/contacts";

export const metadata: Metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const r = token ? await authProvider().verifyEmail(token) : { ok: false as const, error: "Missing verification link." };
  if (r.ok) await attachVerifiedUser(r.userId);
  return (
    <div>
      <h1 className="display-md">{r.ok ? "Email verified" : "Verification failed"}</h1>
      <p className="mt-4 text-[var(--muted-ink)]">{r.ok ? "Thank you. Your account is active and any purchases made with this email are now in your portal." : r.error}</p>
      <Link href="/login" className="btn btn-primary mt-8">Sign in</Link>
    </div>
  );
}
