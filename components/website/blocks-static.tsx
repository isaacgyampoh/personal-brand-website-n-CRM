import Link from "next/link";
import type { BlockProps } from "@/features/website-builder/domain/blocks";
import { Emphasis, Paragraphs } from "./emphasis";
import { NewsletterForm } from "./newsletter-form";

/**
 * Presentational website blocks with no server dependencies. Used by the
 * public renderer AND the visual editor canvas, so previews match the site.
 */

/* Shared bits ------------------------------------------------------------ */

export const toneClass = (tone?: string) => `tone-${tone ?? "paper"}`;

export function Cta({ cta, variant = "primary" }: { cta?: { label: string; href: string }; variant?: "primary" | "outline" | "link" | "accent" }) {
  if (!cta?.label || !cta.href) return null;
  const external = cta.href.startsWith("http");
  return (
    <Link href={cta.href} className={`btn btn-${variant}`} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {cta.label} <span className="arrow" aria-hidden>→</span>
    </Link>
  );
}

export function Eyebrow({ text }: { text?: string }) {
  return text ? <p className="eyebrow eyebrow-rule">{text}</p> : null;
}

/** Responsive candidates for uploaded images, filled in server-side by RenderBlocks (features/media/application/srcset.ts). */
export type SrcSets = Record<string, string>;

export function Img({ src, alt, className = "", priority = false, srcSet, sizes }: { src: string; alt: string; className?: string; priority?: boolean; srcSet?: string; sizes?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={priority ? "eager" : "lazy"} decoding="async" {...(srcSet ? { srcSet, sizes: sizes ?? "100vw" } : {})} {...(priority ? { fetchPriority: "high" as const } : {})} />;
}

export function videoEmbed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?dnt=1`;
  return null;
}

export function SectionHead({ eyebrow, heading, intro, cta, align = "split" }: { eyebrow?: string; heading?: string; intro?: string; cta?: { label: string; href: string }; align?: "split" | "left" }) {
  if (!heading && !eyebrow) return null;
  return (
    <div className={`reveal mb-14 grid gap-8 md:mb-20 ${align === "split" ? "md:grid-cols-12 md:items-end" : ""}`}>
      <div className="md:col-span-7">
        <Eyebrow text={eyebrow} />
        {heading && <h2 className="display-lg mt-5"><Emphasis text={heading} /></h2>}
      </div>
      {(intro || cta?.label) && (
        <div className="md:col-span-4 md:col-start-9">
          {intro && <p className="lede">{intro}</p>}
          {cta?.label && <div className="mt-6"><Cta cta={cta} variant="link" /></div>}
        </div>
      )}
    </div>
  );
}


export function Hero(p: BlockProps<"Hero">) {
  if (!p.headline) return null;
  const embed = p.videoUrl ? videoEmbed(p.videoUrl) : null;
  const headline = (
    <h1 className="display-xl">
      <Emphasis text={p.headline} />
      {p.emphasis && <> <em>{p.emphasis}</em></>}
    </h1>
  );
  const actions = (p.primaryCta.label || p.secondaryCta.label) && (
    <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
      <Cta cta={p.primaryCta} variant="primary" />
      <Cta cta={p.secondaryCta} variant="link" />
    </div>
  );

  if (p.variant === "statement" || (!p.imageUrl && !embed)) {
    return (
      <section className={`${toneClass(p.tone)} relative overflow-hidden`}>
        <div className="site-container pb-20 pt-16 md:pb-32 md:pt-28">
          <div className="max-w-5xl">
            {p.eyebrow && <p className="eyebrow eyebrow-rule mb-8">{p.eyebrow}</p>}
            {headline}
            <div className="mt-10 grid gap-10 md:grid-cols-12">
              {p.body && <p className="lede md:col-span-6">{p.body}</p>}
              <div className="md:col-span-5 md:col-start-8 md:self-end">{actions}</div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (p.variant === "portrait-full" && p.imageUrl) {
    return (
      <section className="relative isolate min-h-[88svh] overflow-hidden text-[var(--paper)]">
        <Img src={p.imageUrl} alt={p.imageAlt} priority srcSet={(p as { imageSrcSet?: string }).imageSrcSet} sizes="100vw" className="absolute inset-0 -z-10 size-full object-cover object-[60%_20%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-black/10" aria-hidden />
        <div className="site-container flex min-h-[88svh] flex-col justify-end pb-16 pt-32 md:pb-24">
          <div className="max-w-3xl [--muted-ink:rgba(255,255,255,.8)] [&_.btn-primary]:bg-[var(--paper)] [&_.btn-primary]:text-[var(--ink)]">
            {p.eyebrow && <p className="eyebrow eyebrow-rule mb-6">{p.eyebrow}</p>}
            {headline}
            {p.body && <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-90">{p.body}</p>}
            {actions}
          </div>
        </div>
      </section>
    );
  }

  // Editorial split (default)
  return (
    <section className={toneClass(p.tone)}>
      <div className="site-container grid items-center gap-12 pb-16 pt-8 md:pb-24 md:pt-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-6 lg:pr-6">
          {p.eyebrow && <p className="eyebrow eyebrow-rule mb-8">{p.eyebrow}</p>}
          {headline}
          {p.body && <p className="lede mt-8 max-w-lg">{p.body}</p>}
          {actions}
        </div>
        <div className="relative lg:col-span-5 lg:col-start-8">
          {embed ? (
            <div className="img-frame aspect-video">
              <iframe src={embed} title={p.imageAlt || "Introduction video"} className="absolute inset-0 size-full" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" />
            </div>
          ) : (
            <>
              <div className="img-frame aspect-[4/5]">
                <Img src={p.imageUrl} alt={p.imageAlt} priority srcSet={(p as { imageSrcSet?: string }).imageSrcSet} sizes="(min-width: 1024px) 40vw, 90vw" className="absolute inset-0 size-full object-cover" />
              </div>
              <div aria-hidden className="absolute -bottom-6 -left-6 hidden h-40 w-40 border border-[var(--brand-accent)] lg:block" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function Introduction(p: BlockProps<"Introduction">) {
  if (!p.heading && !p.body) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid gap-12 lg:grid-cols-12">
        {p.imageUrl && (
          <div className="reveal lg:col-span-4">
            <div className="img-frame aspect-[3/4]"><Img src={p.imageUrl} alt={p.imageAlt} srcSet={(p as { imageSrcSet?: string }).imageSrcSet} sizes="(min-width: 1024px) 40vw, 90vw" className="absolute inset-0 size-full object-cover" /></div>
          </div>
        )}
        <div className={`reveal ${p.imageUrl ? "lg:col-span-7 lg:col-start-6" : "lg:col-span-8 lg:col-start-3"}`}>
          <Eyebrow text={p.eyebrow} />
          {p.heading && <h2 className="display-lg mt-5"><Emphasis text={p.heading} /></h2>}
          {p.body && <Paragraphs text={p.body} className="prose-site mt-8 text-[color-mix(in_oklab,currentColor_85%,transparent)]" />}
          {p.signature && <p className="mt-10 font-display text-3xl italic">{p.signature}</p>}
          {p.cta.label && <div className="mt-10"><Cta cta={p.cta} variant="outline" /></div>}
        </div>
      </div>
    </section>
  );
}

export function Statement(p: BlockProps<"Statement">) {
  if (!p.statement) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <figure className="site-container reveal max-w-5xl text-center">
        <span aria-hidden className="font-display text-7xl leading-none text-[var(--brand-accent)]">“</span>
        <blockquote className="display-md -mt-4"><Emphasis text={p.statement} /></blockquote>
        {p.attribution && <figcaption className="eyebrow mt-10">{p.attribution}</figcaption>}
      </figure>
    </section>
  );
}

export function EditorialText(p: BlockProps<"EditorialText">) {
  if (!p.heading && !p.body) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className={`site-container ${p.layout === "centered" ? "max-w-3xl text-center" : "grid gap-12 lg:grid-cols-12"}`}>
        <div className={p.layout === "centered" ? "" : "reveal lg:col-span-4"}>
          <Eyebrow text={p.eyebrow} />
          {p.heading && <h2 className="display-md mt-5"><Emphasis text={p.heading} /></h2>}
        </div>
        <div className={p.layout === "centered" ? "mt-8" : "reveal lg:col-span-7 lg:col-start-6"}>
          {p.body && <Paragraphs text={p.body} className="prose-site" />}
          {p.layout === "with-aside" && p.aside && (
            <aside className="mt-10 border-l-2 border-[var(--brand-accent)] pl-6 font-display text-2xl italic leading-snug">{p.aside}</aside>
          )}
        </div>
      </div>
    </section>
  );
}

export function ImageText(p: BlockProps<"ImageText">) {
  if (!p.heading && !p.body) return null;
  const image = p.imageUrl && (
    <div className="reveal lg:col-span-6">
      <div className="img-frame aspect-[5/6]"><Img src={p.imageUrl} alt={p.imageAlt} srcSet={(p as { imageSrcSet?: string }).imageSrcSet} sizes="(min-width: 1024px) 45vw, 90vw" className="absolute inset-0 size-full object-cover" /></div>
    </div>
  );
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        {p.imageSide === "left" && image}
        <div className={`reveal ${p.imageUrl ? "lg:col-span-5" : "lg:col-span-8"} ${p.imageSide === "left" ? "lg:col-start-8" : ""}`}>
          <Eyebrow text={p.eyebrow} />
          {p.heading && <h2 className="display-lg mt-5"><Emphasis text={p.heading} /></h2>}
          {p.body && <Paragraphs text={p.body} className="prose-site mt-8" />}
          {p.cta.label && <div className="mt-10"><Cta cta={p.cta} variant="outline" /></div>}
        </div>
        {p.imageSide === "right" && <div className="lg:col-start-7 lg:col-span-6">{image}</div>}
      </div>
    </section>
  );
}

export function Stats(p: BlockProps<"Stats">) {
  const items = p.items.filter((i) => i.value && i.label);
  if (!items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y-sm`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} align="left" />
        <dl className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4">
          {items.map((i, n) => (
            <div key={n} className="reveal border-t border-[var(--line)] pt-6">
              <dt className="sr-only">{i.label}</dt>
              <dd className="font-display text-[clamp(2.8rem,6vw,4.6rem)] leading-none tracking-[-0.03em]">{i.value}</dd>
              <dd className="mt-4 text-sm font-semibold">{i.label}</dd>
              {i.note && <dd className="mt-1 text-sm text-[var(--muted-ink)]">{i.note}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function Logos(p: BlockProps<"Logos">) {
  const items = p.items.filter((i) => i.name);
  if (!items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y-sm`}>
      <div className="site-container">
        {p.heading && <p className="eyebrow mb-10 text-center">{p.heading}</p>}
        <ul className="flex flex-wrap items-center justify-center gap-x-14 gap-y-8">
          {items.map((i, n) => {
            const inner = i.logoUrl ? <Img src={i.logoUrl} alt={i.name} className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-10" /> : <span className="font-display text-2xl opacity-70">{i.name}</span>;
            return <li key={n}>{i.href ? <a href={i.href} target="_blank" rel="noopener noreferrer">{inner}</a> : inner}</li>;
          })}
        </ul>
      </div>
    </section>
  );
}

export function Timeline(p: BlockProps<"Timeline">) {
  const items = p.items.filter((i) => i.title);
  if (!items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4"><div className="lg:sticky lg:top-32"><Eyebrow text={p.eyebrow} />{p.heading && <h2 className="display-md mt-5"><Emphasis text={p.heading} /></h2>}</div></div>
        <ol className="lg:col-span-7 lg:col-start-6">
          {items.map((i, n) => (
            <li key={n} className="reveal grid grid-cols-[5.5rem_1fr] gap-6 border-t border-[var(--line)] py-8 md:grid-cols-[8rem_1fr]">
              <span className="font-display text-2xl text-[var(--brand-accent)]">{i.year}</span>
              <div><h3 className="text-lg font-semibold">{i.title}</h3>{i.body && <p className="mt-2 leading-relaxed text-[var(--muted-ink)]">{i.body}</p>}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Speaking(p: BlockProps<"Speaking">) {
  if (!p.heading && !p.items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid gap-12 lg:grid-cols-12">
        <div className="reveal lg:col-span-5">
          <Eyebrow text={p.eyebrow} />
          {p.heading && <h2 className="display-lg mt-5"><Emphasis text={p.heading} /></h2>}
          {p.body && <p className="lede mt-8">{p.body}</p>}
          {p.cta.label && <div className="mt-10"><Cta cta={p.cta} /></div>}
        </div>
        {p.items.length > 0 && (
          <ul className="lg:col-span-6 lg:col-start-7">
            {p.items.map((i, n) => (
              <li key={n} className="reveal flex items-baseline justify-between gap-6 border-b border-[var(--line)] py-6">
                <span className="display-sm">{i.title}</span><span className="text-right text-sm text-[var(--muted-ink)]">{i.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function Gallery(p: BlockProps<"Gallery">) {
  const images = p.images.filter((i) => i.url);
  if (!images.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        {p.heading && <h2 className="display-md reveal mb-12"><Emphasis text={p.heading} /></h2>}
        <div className={p.layout === "row" ? "flex snap-x gap-6 overflow-x-auto pb-4" : "columns-1 gap-6 sm:columns-2 lg:columns-3"}>
          {images.map((i, n) => (
            <figure key={n} className={`reveal ${p.layout === "row" ? "w-[78vw] shrink-0 snap-start sm:w-[420px]" : "mb-6 break-inside-avoid"}`}>
              <div className="img-frame"><Img src={i.url} alt={i.alt} className="w-full" /></div>
              {i.caption && <figcaption className="mt-3 text-sm text-[var(--muted-ink)]">{i.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Video(p: BlockProps<"Video">) {
  const src = p.url ? videoEmbed(p.url) : null;
  if (!src) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container max-w-5xl">
        {p.heading && <h2 className="display-md reveal mb-10"><Emphasis text={p.heading} /></h2>}
        <div className="img-frame aspect-video"><iframe src={src} title={p.heading || "Video"} loading="lazy" className="absolute inset-0 size-full" allow="encrypted-media; picture-in-picture; fullscreen" /></div>
        {p.caption && <p className="mt-4 text-sm text-[var(--muted-ink)]">{p.caption}</p>}
      </div>
    </section>
  );
}

export function Faq(p: BlockProps<"Faq">) {
  const items = p.items.filter((i) => i.question && i.answer);
  if (!items.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4"><Eyebrow text={p.eyebrow} />{p.heading && <h2 className="display-md mt-5"><Emphasis text={p.heading} /></h2>}</div>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)] lg:col-span-7 lg:col-start-6">
          {items.map((i, n) => (
            <details key={n} className="group py-2">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-medium">
                {i.question}<span aria-hidden className="text-2xl transition-transform group-open:rotate-45">+</span>
              </summary>
              <Paragraphs text={i.answer} className="prose-site pb-6 text-[var(--muted-ink)]" />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Pricing(p: BlockProps<"Pricing">) {
  const tiers = p.tiers.filter((t) => t.name);
  if (!tiers.length) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container">
        <SectionHead eyebrow={p.eyebrow} heading={p.heading} intro={p.intro} />
        <div className={`grid gap-6 md:grid-cols-2 ${tiers.length >= 3 ? "lg:grid-cols-3" : ""}`}>
          {tiers.map((t, n) => (
            <div key={n} className={`reveal flex flex-col p-8 md:p-10 ${t.highlighted ? "tone-ink" : "card-frame"}`}>
              <p className="eyebrow">{t.name}</p>
              <p className="mt-6 font-display text-5xl">{t.price}<span className="ml-2 font-body text-sm opacity-70">{t.period}</span></p>
              {t.description && <p className="mt-4 opacity-80">{t.description}</p>}
              <ul className="mt-8 flex-1 space-y-3 text-[0.95rem]">
                {t.features.filter((f) => f.text).map((f, k) => <li key={k} className="flex gap-3"><span aria-hidden className="text-[var(--brand-accent)]">—</span>{f.text}</li>)}
              </ul>
              {t.cta.label && <div className="mt-10"><Cta cta={t.cta} variant={t.highlighted ? "accent" : "primary"} /></div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Newsletter(p: BlockProps<"Newsletter">) {
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container grid gap-10 lg:grid-cols-12 lg:items-end">
        <div className="reveal lg:col-span-6">
          <Eyebrow text={p.eyebrow} />
          <h2 className="display-lg mt-5"><Emphasis text={p.heading || "Join the newsletter"} /></h2>
          {p.body && <p className="lede mt-6">{p.body}</p>}
        </div>
        <div className="reveal lg:col-span-5 lg:col-start-8"><NewsletterForm source="newsletter-block" buttonLabel={p.buttonLabel || undefined} /></div>
      </div>
    </section>
  );
}

export function CallToAction(p: BlockProps<"CallToAction">) {
  if (!p.heading) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container reveal max-w-5xl text-center">
        <Eyebrow text={p.eyebrow} />
        <h2 className="display-xl mt-6"><Emphasis text={p.heading} /></h2>
        {p.body && <p className="lede mx-auto mt-8 max-w-2xl">{p.body}</p>}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <Cta cta={p.primaryCta} variant={p.tone === "ink" ? "accent" : "primary"} />
          <Cta cta={p.secondaryCta} variant="link" />
        </div>
      </div>
    </section>
  );
}

export function Assessment(p: BlockProps<"Assessment">) {
  if (!p.heading) return null;
  return (
    <section className={`${toneClass(p.tone)} section-y`}>
      <div className="site-container reveal grid gap-10 md:grid-cols-12 md:items-end">
        <div className="md:col-span-7"><Eyebrow text={p.eyebrow} /><h2 className="display-lg mt-5"><Emphasis text={p.heading} /></h2>{p.body && <p className="lede mt-6">{p.body}</p>}</div>
        <div className="md:col-span-4 md:col-start-9"><Cta cta={p.cta.label ? p.cta : { label: "Take the assessment", href: p.assessmentSlug ? `/assessment/${p.assessmentSlug}` : "/assessment" }} /></div>
      </div>
    </section>
  );
}

export function Spacer(p: BlockProps<"Spacer">) {
  const h = { sm: "h-10", md: "h-20", lg: "h-32" }[p.size];
  return <div className={`site-container ${h} flex items-center`}>{p.divider && <hr className="rule w-full" />}</div>;
}
