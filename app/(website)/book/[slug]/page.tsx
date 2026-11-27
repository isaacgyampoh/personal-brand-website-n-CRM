import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublicServices } from "@/features/website/application/public-queries";
import { getPublicSettings } from "@/lib/cache";
import { paymentsReady } from "@/features/payments/application/gateway";
import { BookingFlow } from "@/components/website/booking-flow";
import { priceLabel } from "@/components/website/cards";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = (await getPublicServices()).find((x) => x.slug === slug);
  return { title: s ? `Book — ${s.name}` : "Book", robots: { index: false } };
}

export default async function BookServicePage({ params }: Props) {
  const { slug } = await params;
  const [services, settings] = await Promise.all([getPublicServices(), getPublicSettings()]);
  const s = services.find((x) => x.slug === slug);
  // Enquiry-only services: send visitors to the enquiry form rather than a dead end.
  if (s && s.bookingMode === "enquiry") redirect(`/contact?service=${encodeURIComponent(s.slug)}`);
  if (!s || s.bookingMode !== "instant") notFound();
  const canPay = s.priceMinor === 0 || (await paymentsReady());
  return (
    <div className="site-container pb-28 pt-8 md:pt-14">
      <nav aria-label="Breadcrumb" className="eyebrow mb-8"><Link href="/book" className="hover:text-[var(--brand-accent)]">Book</Link> <span aria-hidden>/</span> {s.name}</nav>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h1 className="display-md">{s.name}</h1>
          <p className="mt-4 text-[var(--muted-ink)]">{s.summary}</p>
          <dl className="mt-8 space-y-3 border-t border-[var(--line)] pt-6 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--muted-ink)]">Duration</dt><dd>{s.durationMinutes} minutes</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted-ink)]">Investment</dt><dd className="font-semibold">{priceLabel(s.priceMinor, s.currency, s.priceDisplay)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted-ink)]">Format</dt><dd className="capitalize">{s.locationType.replace("_", " ")}</dd></div>
          </dl>
          {s.cancellationPolicy && <p className="mt-6 text-xs leading-relaxed text-[var(--muted-ink)]">{s.cancellationPolicy}</p>}
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          {canPay ? (
            <BookingFlow
              serviceSlug={s.slug}
              serviceName={s.name}
              priceLabel={priceLabel(s.priceMinor, s.currency, s.priceDisplay)}
              paid={s.priceMinor > 0}
              businessTimezone={settings.business.timezone}
            />
          ) : (
            <div className="card-frame p-8">
              <p className="display-sm">Online payment isn&apos;t available yet.</p>
              <p className="mt-3 text-[var(--muted-ink)]">Please get in touch and we&apos;ll arrange your session directly.</p>
              <Link href={`/contact?service=${s.slug}`} className="btn btn-primary mt-6">Contact to book</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
