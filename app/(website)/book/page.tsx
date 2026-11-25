import type { Metadata } from "next";
import Link from "next/link";
import { getPublicServices } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { priceLabel } from "@/components/website/cards";

export const metadata: Metadata = { title: "Book a session", alternates: { canonical: "/book" } };

export default async function BookPage() {
  const services = (await getPublicServices()).filter((s) => s.bookingMode === "instant");
  return (
    <>
      <PageHeader eyebrow="Book" title="Book a *session*" intro="Choose a session below, then pick a time that works for you. Times are shown in your own time zone." />
      {!services.length ? (
        <EmptyState title="Online booking isn't open right now." body="Please get in touch and we'll find a time."><Link href="/contact" className="btn btn-primary">Contact</Link></EmptyState>
      ) : (
        <div className="site-container grid gap-6 pb-28 md:grid-cols-2">
          {services.map((s) => (
            <Link key={s.id} href={`/book/${s.slug}`} className="group card-frame flex flex-col p-8 transition-colors hover:border-[var(--ink)] md:p-10">
              <p className="eyebrow">{s.durationMinutes} min · {priceLabel(s.priceMinor, s.currency, s.priceDisplay)}</p>
              <h2 className="display-sm mt-4">{s.name}</h2>
              <p className="mt-3 flex-1 text-[var(--muted-ink)]">{s.summary}</p>
              <span className="btn btn-link mt-8 self-start !p-0">Select <span className="arrow" aria-hidden>→</span></span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
