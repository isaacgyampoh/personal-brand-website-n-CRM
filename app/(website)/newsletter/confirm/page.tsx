import type { Metadata } from "next";
import Link from "next/link";
import { confirmSubscription } from "@/features/marketing/application/subscribers";

export const metadata: Metadata = { title: "Subscription", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const ok = await confirmSubscription((await searchParams).token ?? "");
  return (
    <div className="site-container max-w-2xl py-28">
      <h1 className="display-lg">{ok ? <>You&apos;re <em>subscribed</em>.</> : "This link has expired or was already used."}</h1>
      <p className="mt-6 text-[var(--muted-ink)]">{ok ? "Thank you for confirming. The next letter will arrive in your inbox." : "If you're not receiving emails, subscribe again and we'll send a fresh confirmation link."}</p>
      <Link href="/" className="btn btn-primary mt-10">Back to home</Link>
    </div>
  );
}
