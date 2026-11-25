import type { Metadata } from "next";
import { unsubscribe } from "@/features/marketing/application/subscribers";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

async function unsubscribeAction(fd: FormData) {
  "use server";
  const { redirect } = await import("next/navigation");
  const ok = await unsubscribe(String(fd.get("token") ?? ""));
  redirect(`/newsletter/unsubscribe?done=${ok ? 1 : 0}`);
}

/** Two-step (button) unsubscribe so link-scanners can't unsubscribe people by prefetching. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="site-container max-w-2xl py-28">
      {sp.done ? (
        <>
          <h1 className="display-lg">{sp.done === "1" ? "You've been unsubscribed." : "That link wasn't recognised."}</h1>
          <p className="mt-6 text-[var(--muted-ink)]">{sp.done === "1" ? "You won't receive marketing emails from us. Transactional emails about bookings or purchases will still be sent." : "You may already be unsubscribed."}</p>
        </>
      ) : (
        <form action={unsubscribeAction}>
          <h1 className="display-lg">Unsubscribe from the newsletter?</h1>
          <input type="hidden" name="token" value={sp.token ?? ""} />
          <button className="btn btn-primary mt-10">Yes, unsubscribe me</button>
        </form>
      )}
    </div>
  );
}
