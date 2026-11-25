import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/database/pool";
import { verifyAndApply } from "@/features/commerce/application/fulfilment";
import { formatMoney } from "@/lib/money";
import { CheckoutPoller } from "@/components/website/checkout-poller";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Paystack redirects here with ?reference=. Reaching this page NEVER marks an
 * order paid: we independently verify with Paystack server-side, and the
 * webhook + reconciliation job are authoritative backups.
 */
export default async function CheckoutComplete({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string; order?: string }> }) {
  const sp = await searchParams;
  const reference = (sp.reference ?? sp.trxref ?? "").slice(0, 80);
  let orderRef = sp.order && /^ORD-[A-Z0-9]{10}$/.test(sp.order) ? sp.order : null;
  let verifyError = false;
  if (reference && /^ORD-[A-Z0-9]{10}-P\d+$/.test(reference)) {
    try {
      const r = await verifyAndApply(reference);
      orderRef = r.orderReference;
    } catch {
      verifyError = true;
      orderRef = reference.replace(/-P\d+$/, "");
    }
  }
  const order = orderRef
    ? await db.one<{ status: string; total_minor: number; currency: string; reference: string; items: string }>(
        `select o.status, o.total_minor, o.currency, o.reference, string_agg(i.description, ', ') as items
           from orders o join order_items i on i.order_id = o.id where o.reference = $1 group by o.id`,
        [orderRef],
      )
    : null;

  const paid = order && ["paid", "needs_attention"].includes(order.status);
  const failed = order?.status === "failed";
  return (
    <div className="site-container max-w-3xl pb-28 pt-16 md:pt-24">
      <p className="eyebrow eyebrow-rule">{order ? `Order ${order.reference}` : "Payment"}</p>
      {paid ? (
        <>
          <h1 className="display-lg mt-6">Thank you — payment <em>received</em>.</h1>
          <p className="lede mt-6">{order!.items}</p>
          {order!.total_minor > 0 && <p className="mt-2 font-semibold">{formatMoney(order!.total_minor, order!.currency)}</p>}
          <p className="mt-6 text-[var(--muted-ink)]">Your confirmation and receipt are on their way by email. You can access everything in your portal — sign in with the same email address.</p>
          <div className="mt-10 flex flex-wrap gap-6"><Link href="/portal" className="btn btn-primary">Open your portal</Link><Link href="/" className="btn btn-link">Back to home</Link></div>
        </>
      ) : failed ? (
        <>
          <h1 className="display-lg mt-6">Payment didn&apos;t go through.</h1>
          <p className="mt-6 text-[var(--muted-ink)]">No money was taken for this attempt. You can try again while your reservation is held.</p>
          <div className="mt-10 flex flex-wrap gap-6"><Link href={`/checkout/retry/${order!.reference}`} className="btn btn-primary">Try again</Link><Link href="/contact" className="btn btn-link">Contact us</Link></div>
        </>
      ) : order ? (
        <>
          <h1 className="display-lg mt-6">Confirming your payment…</h1>
          <p className="mt-6 text-[var(--muted-ink)]">{verifyError ? "We couldn't reach the payment provider just now." : "Your payment is still being processed."} This page will update automatically. You'll also receive an email once it's confirmed.</p>
          <CheckoutPoller />
        </>
      ) : (
        <>
          <h1 className="display-lg mt-6">We couldn&apos;t find that payment.</h1>
          <p className="mt-6 text-[var(--muted-ink)]">If you were charged, please contact us with your payment reference and we&apos;ll sort it out.</p>
          <Link href="/contact" className="btn btn-primary mt-10">Contact us</Link>
        </>
      )}
    </div>
  );
}
