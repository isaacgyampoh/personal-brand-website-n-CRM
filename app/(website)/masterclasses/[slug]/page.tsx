import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/features/website/application/public-queries";
import { eventRepo } from "@/features/events/infrastructure/repository";
import { publicTickets } from "@/features/events/application/registration";
import { registrationState } from "@/features/events/domain/rules";
import { integrations } from "@/lib/config/env";
import { formatInZone } from "@/lib/time";
import { RichText } from "@/components/shared/rich-text";
import { EventRegistration } from "@/components/website/event-registration";
import { WaitlistForm } from "@/components/website/waitlist-form";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await getPublicEvent((await params).slug);
  if (!e) return {};
  return {
    title: e.seo.title || e.title,
    description: e.seo.description || e.summary,
    alternates: { canonical: `/masterclasses/${e.slug}` },
    openGraph: { type: "website", title: e.title, description: e.summary },
  };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const e = await getPublicEvent(slug);
  if (!e) notFound();
  const row = await eventRepo.bySlug(slug);
  const tickets = row ? await publicTickets(row) : [];
  const state = row ? registrationState(row) : "closed";
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  const date = formatInZone(start, e.timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = `${formatInZone(start, e.timezone, { hour: "2-digit", minute: "2-digit" })} – ${formatInZone(end, e.timezone, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`;
  const onSale = tickets.filter((t) => t.onSale);
  const soldOut = onSale.length > 0 && onSale.every((t) => t.remaining === 0);
  const paymentsReady = integrations().payments;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.summary,
    startDate: e.startsAt,
    endDate: e.endsAt,
    eventStatus: e.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: e.format === "online" ? "https://schema.org/OnlineEventAttendanceMode" : e.format === "hybrid" ? "https://schema.org/MixedEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: e.format === "online" ? { "@type": "VirtualLocation", url: `${process.env.APP_URL}/masterclasses/${e.slug}` } : { "@type": "Place", name: e.venueName, address: e.venueAddress },
    image: e.coverUrl ? [e.coverUrl] : undefined,
    performer: e.speakers.map((s) => ({ "@type": "Person", name: s.name })),
    offers: tickets.map((t) => ({ "@type": "Offer", name: t.name, price: (t.price_minor / 100).toFixed(2), priceCurrency: t.currency, availability: t.remaining === 0 ? "https://schema.org/SoldOut" : "https://schema.org/InStock", url: `${process.env.APP_URL}/masterclasses/${e.slug}` })),
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="site-container pb-16 pt-8 md:pt-14">
        <nav aria-label="Breadcrumb" className="eyebrow mb-10"><Link href="/masterclasses" className="hover:text-[var(--brand-accent)]">Masterclasses</Link> <span aria-hidden>/</span> <span className="capitalize">{e.kind.replace("_", " ")}</span></nav>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            {e.status === "cancelled" && <p className="mb-6 inline-block bg-red-700 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white">Cancelled</p>}
            <h1 className="display-xl">{e.title}</h1>
            {e.subtitle && <p className="lede mt-6 max-w-2xl">{e.subtitle}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-6 border-t border-[var(--line)] pt-6 text-sm lg:col-span-4 lg:col-start-9">
            <div><dt className="eyebrow">Date</dt><dd className="mt-2 font-semibold">{date}</dd></div>
            <div><dt className="eyebrow">Time</dt><dd className="mt-2 font-semibold">{time}</dd></div>
            <div><dt className="eyebrow">Format</dt><dd className="mt-2 font-semibold capitalize">{e.format.replace("_", " ")}</dd></div>
            <div><dt className="eyebrow">Where</dt><dd className="mt-2 font-semibold">{e.format === "online" ? "Live online" : e.venueName || "To be confirmed"}</dd></div>
          </dl>
        </div>
        {e.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="img-frame mt-14 aspect-[21/9]"><img src={e.coverUrl} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover" /></div>
        )}
      </header>

      <div className="site-container grid gap-16 pb-28 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {e.summary && <p className="display-sm mb-10">{e.summary}</p>}
          <RichText doc={e.description} />
          {e.sessions.length > 1 && (
            <section className="mt-16" aria-labelledby="sessions">
              <h2 id="sessions" className="eyebrow mb-6">Sessions</h2>
              <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {e.sessions.map((s, i) => (
                  <li key={i} className="flex justify-between gap-6 py-4"><span className="font-semibold">{s.title}</span><span className="text-right text-sm text-[var(--muted-ink)]">{formatInZone(new Date(s.startsAt), e.timezone, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></li>
                ))}
              </ol>
            </section>
          )}
          {e.agenda.length > 0 && (
            <section className="mt-16" aria-labelledby="agenda">
              <h2 id="agenda" className="eyebrow mb-6">Agenda</h2>
              <ol>{e.agenda.map((a, i) => (
                <li key={i} className="grid grid-cols-[5rem_1fr] gap-6 border-t border-[var(--line)] py-5"><span className="font-display text-xl text-[var(--brand-accent)]">{a.time}</span><div><p className="font-semibold">{a.title}</p>{a.description && <p className="mt-1 text-[var(--muted-ink)]">{a.description}</p>}</div></li>
              ))}</ol>
            </section>
          )}
          {e.speakers.length > 0 && (
            <section className="mt-16" aria-labelledby="speakers">
              <h2 id="speakers" className="eyebrow mb-6">{e.speakers.length > 1 ? "Speakers" : "Your host"}</h2>
              <div className="grid gap-10 sm:grid-cols-2">
                {e.speakers.map((s, i) => (
                  <div key={i} className="flex gap-5">
                    {s.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photoUrl} alt="" className="size-20 shrink-0 object-cover" loading="lazy" />
                    )}
                    <div><p className="display-sm">{s.name}</p>{s.title && <p className="text-sm text-[var(--muted-ink)]">{s.title}</p>}{s.bio && <p className="mt-3 text-sm leading-relaxed">{s.bio}</p>}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {e.faqs.length > 0 && (
            <section className="mt-16" aria-labelledby="faqs">
              <h2 id="faqs" className="eyebrow mb-6">Questions</h2>
              <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {e.faqs.map((f, i) => (
                  <details key={i} className="group"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">{f.q}<span aria-hidden className="text-xl group-open:rotate-45">+</span></summary><p className="pb-5 text-[var(--muted-ink)]">{f.a}</p></details>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:col-span-4 lg:col-start-9" aria-labelledby="register">
          <div className="card-frame sticky top-28 p-7 md:p-8">
            <h2 id="register" className="display-sm">Reserve your place</h2>
            {e.status === "cancelled" ? (
              <p className="mt-4 text-[var(--muted-ink)]">This event has been cancelled.{e.cancellationReason ? ` ${e.cancellationReason}` : ""}</p>
            ) : state === "ended" ? (
              <p className="mt-4 text-[var(--muted-ink)]">This session has finished. Registered attendees can find any recordings in their portal.</p>
            ) : state === "not_open" ? (
              <p className="mt-4 text-[var(--muted-ink)]">Registration opens {e.registrationOpensAt ? formatInZone(new Date(e.registrationOpensAt), e.timezone, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "soon"}.</p>
            ) : state === "closed" ? (
              <p className="mt-4 text-[var(--muted-ink)]">Registration has closed.</p>
            ) : soldOut || !onSale.length ? (
              <>
                <p className="mt-4 text-[var(--muted-ink)]">{soldOut ? "This session is fully booked." : "Tickets are not on sale right now."}</p>
                {e.waitlistEnabled && <div className="mt-6"><WaitlistForm eventSlug={e.slug} /></div>}
              </>
            ) : (
              <EventRegistration
                eventSlug={e.slug}
                paymentsReady={paymentsReady}
                tickets={onSale.map((t) => ({ id: t.id, name: t.name, description: t.description, priceMinor: t.price_minor, currency: t.currency, remaining: t.remaining, maxPerOrder: t.max_per_order, salesEndAt: t.sales_end_at ? new Date(t.sales_end_at).toISOString() : null }))}
              />
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
