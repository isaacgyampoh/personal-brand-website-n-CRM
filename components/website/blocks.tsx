import Link from "next/link";
import type { Block, BlockProps } from "@/features/website-builder/domain/blocks";
import {
  getPublicArticles, getPublicCourses, getPublicEvents, getPublicServices, getPublicTestimonials,
} from "@/features/website/application/public-queries";
import { ArticleCard, CourseCard, EventCard, ServiceCard, priceLabel } from "./cards";
import { Emphasis, Paragraphs } from "./emphasis";
import { getPublicSettings } from "@/lib/cache";
import { srcSetsFor } from "@/features/media/application/srcset";
import { Eyebrow, Img, SectionHead, toneClass, Hero, Introduction, Statement, EditorialText, ImageText, Stats, Logos, Timeline, Speaking, Gallery, Video, Faq, Pricing, Newsletter, CallToAction, Assessment, Spacer } from "./blocks-static";

/* Data-backed blocks (server only) ---------------------------------------- */

async function Services(p: BlockProps<"Services">) {
  const all = await getPublicServices();
  const list = (p.source === "featured" ? all.filter((s) => s.featured) : all).slice(0, p.limit);
  const items = list.length ? list : all.slice(0, p.limit);
  if (!items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} intro={p.intro} cta={p.cta} />
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {items.map((s, i) => <div key={s.id} className="reveal"><ServiceCard s={s} index={i} /></div>)}
        </div>
      </div>
    </section>
  );
}

async function Events(p: BlockProps<"Events">) {
  const now = Date.now();
  const items = (await getPublicEvents()).filter((e) => e.status === "published" && Date.parse(e.endsAt) > now).slice(0, p.limit);
  if (!items.length) return null;
  const [first, ...rest] = items;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} intro={p.intro} cta={p.cta} />
        <div className="reveal"><EventCard e={first} featured /></div>
        {rest.length > 0 && (
          <div className="mt-20 grid gap-14 border-t border-[var(--line)] pt-14 md:grid-cols-2">
            {rest.map((e) => <div key={e.id} className="reveal"><EventCard e={e} /></div>)}
          </div>
        )}
      </div>
    </section>
  );
}

async function Courses(p: BlockProps<"Courses">) {
  const items = (await getPublicCourses()).filter((c) => c.visibility === "public").slice(0, p.limit);
  if (!items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} intro={p.intro} cta={p.cta} />
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => <div key={c.id} className="reveal"><CourseCard c={c} /></div>)}
        </div>
      </div>
    </section>
  );
}

async function Articles(p: BlockProps<"Articles">) {
  const items = await getPublicArticles({ limit: p.limit, featuredOnly: p.featuredOnly });
  if (!items.length) return null;
  const [lead, ...rest] = items;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} cta={p.cta} />
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="reveal lg:col-span-7"><ArticleCard a={lead} large /></div>
          <div className="space-y-12 lg:col-span-4 lg:col-start-9">
            {rest.map((a) => <div key={a.id} className="reveal border-t border-[var(--line)] pt-8"><ArticleCard a={a} /></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

async function Testimonials(p: BlockProps<"Testimonials">) {
  const all = await getPublicTestimonials();
  const items = (p.featuredOnly ? all.filter((t) => t.featured) : all).slice(0, p.limit);
  if (!items.length) return null;
  const [lead, ...rest] = items;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} />
        <figure className="reveal max-w-4xl">
          <blockquote className="display-md"><span className="text-[var(--brand-accent)]">“</span>{lead.quote}”</blockquote>
          <figcaption className="mt-8 flex items-center gap-4">
            {lead.photoUrl && <Img src={lead.photoUrl} alt="" className="size-14 rounded-full object-cover" />}
            <span><span className="block font-semibold">{lead.authorName}</span><span className="text-sm text-[var(--muted-ink)]">{[lead.authorTitle, lead.company].filter(Boolean).join(", ")}</span></span>
          </figcaption>
        </figure>
        {rest.length > 0 && (
          <div className="mt-20 grid gap-12 border-t border-[var(--line)] pt-14 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((t) => (
              <figure key={t.id} className="reveal">
                <blockquote className="text-[1.05rem] leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-6 text-sm"><span className="font-semibold">{t.authorName}</span>{(t.authorTitle || t.company) && <span className="text-[var(--muted-ink)]"> — {[t.authorTitle, t.company].filter(Boolean).join(", ")}</span>}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

async function BookingCard(p: BlockProps<"BookingCard">) {
  const service = (await getPublicServices()).find((s) => s.slug === p.serviceSlug);
  if (!service) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y-sm`}>
      <div className="site-container">
        <div className="reveal card-frame grid gap-8 p-8 md:grid-cols-12 md:items-center md:p-12">
          <div className="md:col-span-7">
            <p className="eyebrow">{service.durationMinutes} minutes · {priceLabel(service.priceMinor, service.currency, service.priceDisplay)}</p>
            <h2 className="display-md mt-4">{p.heading || service.name}</h2>
            <p className="mt-4 text-[var(--muted-ink)]">{p.body || service.summary}</p>
          </div>
          <div className="md:col-span-4 md:col-start-9 md:text-right">
            <Link href={`/book/${service.slug}`} className="btn btn-primary">Choose a time <span className="arrow" aria-hidden>→</span></Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const lines = (t: string) => t.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

/** Biography rendered live from Studio → Business profile. Empty parts are not shown. */
async function Profile(p: BlockProps<"Profile">) {
  const s = await getPublicSettings();
  const bio = s.profile.longBio || s.brand.shortBio;
  if (!bio) return null;
  const lists = [
    p.showExpertise && { title: "Areas of expertise", items: lines(s.profile.expertise) },
    p.showAchievements && { title: "Recognition", items: lines(s.profile.achievements) },
    p.showQualifications && { title: "Qualifications", items: lines(s.profile.qualifications) },
  ].filter((x): x is { title: string; items: string[] } => Boolean(x && x.items.length));
  const image = p.imageUrl || s.brand.portraitUrl;
  const srcSet = image ? (await srcSetsFor([image]).catch(() => ({} as Record<string, string>)))[image] : undefined;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid gap-12 lg:grid-cols-12 lg:gap-16">
        {image && (
          <div className="reveal lg:col-span-5">
            <div className="img-frame aspect-[4/5] lg:sticky lg:top-28"><Img src={image} alt={p.imageAlt || s.brand.portraitAlt || s.profile.fullName || s.brand.name} srcSet={srcSet} sizes="(min-width: 1024px) 40vw, 90vw" className="absolute inset-0 size-full object-cover" /></div>
          </div>
        )}
        <div className={`reveal ${image ? "lg:col-span-6 lg:col-start-7" : "lg:col-span-8"}`}>
          <Eyebrow text={p.eyebrow} />
          {p.heading && <h2 className="display-lg mt-5"><Emphasis text={p.heading} /></h2>}
          <Paragraphs text={bio} className="prose-site mt-8" />
          {p.showMission && (s.profile.mission || s.profile.vision) && (
            <dl className="mt-12 grid gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-2">
              {s.profile.mission && <div><dt className="eyebrow">Mission</dt><dd className="mt-3 leading-relaxed">{s.profile.mission}</dd></div>}
              {s.profile.vision && <div><dt className="eyebrow">Vision</dt><dd className="mt-3 leading-relaxed">{s.profile.vision}</dd></div>}
            </dl>
          )}
          {lists.map((l) => (
            <div key={l.title} className="mt-12 border-t border-[var(--line)] pt-10">
              <p className="eyebrow">{l.title}</p>
              <ul className="mt-5 space-y-3">{l.items.map((i) => <li key={i} className="flex gap-3 leading-relaxed"><span aria-hidden className="mt-[0.7em] h-px w-5 shrink-0 bg-[var(--brand-accent)]" />{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Registry --------------------------------------------------------------- */

const RENDERERS: { [K in Block["type"]]: (p: BlockProps<K>) => React.ReactNode | Promise<React.ReactNode> } = {
  Hero, Introduction, Statement, EditorialText, ImageText, Services, Events, Courses, Articles, Testimonials, Stats, Logos,
  Timeline, Speaking, Gallery, Video, Faq, Pricing, Newsletter, CallToAction, BookingCard, Assessment, Spacer, Profile,
};

export async function RenderBlocks({ blocks }: { blocks: Block[] }) {
  // Responsive image candidates for uploaded photos (phones get the 480/960 px versions).
  const sets = await srcSetsFor(blocks.map((b) => (b.props as { imageUrl?: string }).imageUrl ?? "")).catch(() => ({} as Record<string, string>));
  return (
    <>
      {blocks.map((b, i) => {
        if ((b.props as { hidden?: boolean }).hidden) return null;
        const Component = RENDERERS[b.type] as (p: unknown) => React.ReactNode;
        const url = (b.props as { imageUrl?: string }).imageUrl;
        const props = url && sets[url] ? { ...b.props, imageSrcSet: sets[url] } : b.props;
        return Component ? <Component key={(b.props as { id?: string }).id ?? i} {...props} /> : null;
      })}
    </>
  );
}
