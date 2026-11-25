import type { Metadata } from "next";
import { getPublicAppearances } from "@/features/website/application/public-queries";
import { getPublicSettings } from "@/lib/cache";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { EnquiryForm } from "@/components/website/enquiry-form";

export const metadata: Metadata = { title: "Press & media", alternates: { canonical: "/media" } };

const KIND: Record<string, string> = { interview: "Interviews", podcast: "Podcasts", video: "Video", press: "Press coverage", speaking_engagement: "Speaking" };

export default async function MediaPage() {
  const [items, s] = await Promise.all([getPublicAppearances(), getPublicSettings()]);
  const groups = Object.keys(KIND).map((k) => [k, items.filter((i) => i.kind === k)] as const).filter(([, l]) => l.length);
  return (
    <>
      <PageHeader eyebrow="Press" title="In the *media*" intro="Interviews, podcasts and coverage. Journalists and producers can request a media kit below." />
      {!groups.length && <EmptyState title="Media features will appear here." />}
      <div className="site-container space-y-20 pb-20">
        {groups.map(([k, list]) => (
          <section key={k} aria-labelledby={`m-${k}`}>
            <h2 id={`m-${k}`} className="eyebrow mb-8">{KIND[k]}</h2>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {list.map((i) => {
                const inner = (
                  <div className="grid gap-3 py-7 md:grid-cols-12 md:items-baseline">
                    <span className="text-sm text-[var(--muted-ink)] md:col-span-2">{i.appearedOn ? new Date(i.appearedOn).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : ""}</span>
                    <span className="display-sm md:col-span-6">{i.title}</span>
                    <span className="md:col-span-3">{i.outlet}</span>
                    {i.url && <span aria-hidden className="text-right md:col-span-1">↗</span>}
                  </div>
                );
                return <li key={i.id}>{i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className="block hover:text-[var(--brand-accent)]">{inner}</a> : inner}</li>;
              })}
            </ul>
          </section>
        ))}
      </div>
      <section className="tone-surface section-y-sm">
        <div className="site-container grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4"><h2 className="display-md">Media kit & interview requests</h2><p className="mt-4 text-[var(--muted-ink)]">{s.contact.email ? <>Or email <a className="underline" href={`mailto:${s.contact.email}`}>{s.contact.email}</a>.</> : "We'll respond with the current media kit and availability."}</p></div>
          <div className="lg:col-span-7 lg:col-start-6"><EnquiryForm form="media" showOrg submitLabel="Request media kit" /></div>
        </div>
      </section>
    </>
  );
}
