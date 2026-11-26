import type { Metadata } from "next";
import Link from "next/link";
import { getPublicAppearances, getPublishedPage, getSpeakingTopics } from "@/features/website/application/public-queries";
import { RenderBlocks } from "@/components/website/blocks";
import { PageHeader } from "@/components/website/page-header";
import { EnquiryForm } from "@/components/website/enquiry-form";
import type { PageData } from "@/features/website-builder/domain/blocks";

export const metadata: Metadata = { title: "Speaking", alternates: { canonical: "/speaking" } };

export default async function SpeakingPage() {
  const [page, topics, appearances] = await Promise.all([getPublishedPage("speaking"), getSpeakingTopics(), getPublicAppearances()]);
  const engagements = appearances.filter((a) => a.kind === "speaking_engagement");
  const content = page?.published_content as PageData | null;
  return (
    <>
      {content?.content.length ? <RenderBlocks blocks={content.content} /> : <PageHeader eyebrow="Speaking" title="Keynotes, panels & *workshops*" intro="Talks on personal branding, executive presence and building authority online — tailored to your audience." />}
      {topics.length > 0 && (
        <section className="site-container section-y-sm" aria-labelledby="topics">
          <h2 id="topics" className="eyebrow mb-10">Signature topics</h2>
          <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {topics.map((t, i) => (
              <li key={t.id} className="grid gap-4 py-10 md:grid-cols-12">
                <span className="font-display text-2xl text-[var(--muted-ink)] md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="display-sm md:col-span-5">{t.title}</h3>
                <div className="md:col-span-6">
                  <p className="leading-relaxed">{t.description}</p>
                  {(t.audience || t.formats.length > 0) && <p className="mt-3 text-sm text-[var(--muted-ink)]">{[t.audience, t.formats.join(" · ")].filter(Boolean).join(" — ")}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {engagements.length > 0 && (
        <section className="tone-surface section-y-sm" aria-labelledby="engagements">
          <div className="site-container">
            <h2 id="engagements" className="eyebrow mb-10">Previous engagements</h2>
            <ul className="grid gap-x-10 gap-y-6 md:grid-cols-2">
              {engagements.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-6 border-b border-[var(--line)] pb-4">
                  <span><span className="font-semibold">{e.title}</span>{e.outlet && <span className="text-[var(--muted-ink)]"> — {e.outlet}</span>}</span>
                  {e.appearedOn && <span className="text-sm text-[var(--muted-ink)]">{e.appearedOn.slice(0, 4)}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <section id="enquire" className="site-container section-y grid gap-12 lg:grid-cols-12" aria-labelledby="enquire-h">
        <div className="lg:col-span-4"><p className="eyebrow eyebrow-rule">Invite</p><h2 id="enquire-h" className="display-md mt-5">Speaking enquiry</h2><p className="mt-4 text-[var(--muted-ink)]">Share your event, audience and date. A media kit is available on the <Link className="underline" href="/media">press page</Link>.</p></div>
        <div className="lg:col-span-7 lg:col-start-6"><EnquiryForm form="speaking" showOrg showEventFields submitLabel="Send invitation" /></div>
      </section>
    </>
  );
}
