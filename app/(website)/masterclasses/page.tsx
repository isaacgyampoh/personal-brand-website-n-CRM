import type { Metadata } from "next";
import { getPublicEvents } from "@/features/website/application/public-queries";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { EventCard } from "@/components/website/cards";
import { NewsletterForm } from "@/components/website/newsletter-form";

export const metadata: Metadata = { title: "Masterclasses & events", alternates: { canonical: "/masterclasses" } };

export default async function MasterclassesPage() {
  const events = await getPublicEvents();
  const now = Date.now();
  const upcoming = events.filter((e) => e.status === "published" && Date.parse(e.startsAt) > now);
  const live = events.filter((e) => e.status === "published" && Date.parse(e.startsAt) <= now && Date.parse(e.endsAt) > now);
  const past = events.filter((e) => e.status !== "cancelled" && Date.parse(e.endsAt) <= now).reverse().slice(0, 9);
  return (
    <>
      <PageHeader eyebrow="Masterclasses" title="Learn in the *room*" intro="Live masterclasses, workshops and group programmes — online and in person." />
      {live.length > 0 && (
        <section className="site-container pb-16" aria-labelledby="live">
          <h2 id="live" className="eyebrow mb-8">Happening now</h2>
          <div className="grid gap-14 md:grid-cols-2">{live.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </section>
      )}
      <section className="site-container pb-24" aria-labelledby="upcoming">
        <h2 id="upcoming" className="eyebrow mb-10">Upcoming</h2>
        {upcoming.length ? (
          <div className="space-y-20">
            <EventCard e={upcoming[0]} featured />
            {upcoming.length > 1 && <div className="grid gap-14 border-t border-[var(--line)] pt-14 md:grid-cols-2">{upcoming.slice(1).map((e) => <EventCard key={e.id} e={e} />)}</div>}
          </div>
        ) : (
          <div className="grid gap-10 md:grid-cols-2">
            <div><p className="display-sm">No dates are announced right now.</p><p className="mt-3 text-[var(--muted-ink)]">Join the newsletter to hear first when registration opens.</p></div>
            <NewsletterForm source="masterclasses" compact />
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section className="tone-surface section-y-sm" aria-labelledby="past">
          <div className="site-container">
            <h2 id="past" className="eyebrow mb-10">Previous sessions</h2>
            <div className="grid gap-14 md:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} />)}</div>
          </div>
        </section>
      )}
      {!events.length && <EmptyState title="Events will appear here." />}
    </>
  );
}
