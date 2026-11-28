import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import type { PublicArticle, PublicCourse, PublicEvent, PublicProduct, PublicService } from "@/features/website/application/public-queries";

export function priceLabel(minor: number, currency: string, display?: string) {
  if (display) return display;
  return minor === 0 ? "Complimentary" : formatMoney(minor, currency);
}

function Cover({ src, alt, label, ratio = "aspect-[4/5]" }: { src: string | null; alt: string; label: string; ratio?: string }) {
  return (
    <div className={`img-frame ${ratio}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div aria-hidden className="cover-type absolute inset-0 flex flex-col justify-between p-[8%]">
          <span className="block h-px w-10 bg-current opacity-50" />
          <span className="font-display text-[clamp(1.6rem,3.2vw,2.6rem)] leading-[1.02] tracking-[-0.02em] [text-wrap:balance]">
            {label.replace(/\s*\(Demo\)\s*/g, "")}
          </span>
          <span className="monogram absolute -bottom-[0.18em] right-[4%] text-[clamp(7rem,16vw,13rem)] opacity-[0.14]">{label.slice(0, 1)}</span>
        </div>
      )}
    </div>
  );
}

export function ServiceCard({ s, index }: { s: PublicService; index?: number }) {
  return (
    <Link href={`/services/${s.slug}`} className="card-frame group flex h-full flex-col p-7 transition duration-300 hover:-translate-y-1 hover:border-[var(--brand-accent)] hover:shadow-[0_24px_50px_-30px_rgb(0_0_0/.35)] md:p-8">
      <div className="flex items-baseline justify-between gap-4">
        {index !== undefined && <span className="font-display text-2xl text-[var(--brand-accent)]">{String(index + 1).padStart(2, "0")}</span>}
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-ink)]">{s.locationType === "online" ? "Online" : s.locationType === "phone" ? "Phone" : "In person"}</span>
      </div>
      <h3 className="display-sm mt-6">{s.name}</h3>
      <p className="mt-3 flex-1 text-[0.98rem] leading-relaxed text-[var(--muted-ink)]">{s.summary}</p>
      <div className="mt-7 flex items-center justify-between gap-4 border-t border-[var(--line)] pt-5">
        <span className="text-sm font-semibold">{priceLabel(s.priceMinor, s.currency, s.priceDisplay)}</span>
        <span className="text-sm font-bold text-[var(--brand-accent)] underline decoration-[1.5px] underline-offset-4 group-hover:no-underline">View details</span>
      </div>
    </Link>
  );
}

export function EventCard({ e, featured = false }: { e: PublicEvent; featured?: boolean }) {
  const start = new Date(e.startsAt);
  const day = formatInZone(start, e.timezone, { day: "2-digit" });
  const month = formatInZone(start, e.timezone, { month: "short" });
  const time = formatInZone(start, e.timezone, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const past = new Date(e.endsAt) < new Date();
  return (
    <Link href={`/masterclasses/${e.slug}`} className={`group grid gap-6 ${featured ? "md:grid-cols-[1.1fr_1fr] md:items-center md:gap-12" : ""}`}>
      <Cover src={e.coverUrl} alt="" label={e.title} ratio={featured ? "aspect-[5/4]" : "aspect-[4/3]"} />
      <div>
        <div className="flex items-center gap-5">
          <div className="text-center leading-none">
            <span className="block font-display text-[2.6rem]">{day}</span>
            <span className="eyebrow mt-1 block">{month}</span>
          </div>
          <div className="h-12 w-px bg-[var(--line)]" />
          <div className="text-sm text-[var(--muted-ink)]">
            <p>{time}</p>
            <p className="capitalize">{e.format.replace("_", " ")} · {e.kind.replace("_", " ")}</p>
          </div>
        </div>
        <h3 className={`${featured ? "display-md" : "display-sm"} mt-6 transition-colors group-hover:text-[var(--brand-accent)]`}>{e.title}</h3>
        {e.summary && <p className="mt-3 leading-relaxed text-[var(--muted-ink)]">{e.summary}</p>}
        <p className="mt-5 text-sm font-semibold">
          {e.status === "cancelled" ? "Cancelled" : past ? "Completed" : e.fromPriceMinor === null ? "Details" : e.fromPriceMinor === 0 ? "Free to attend" : `From ${formatMoney(e.fromPriceMinor, e.currency)}`}
        </p>
      </div>
    </Link>
  );
}

export function CourseCard({ c }: { c: PublicCourse }) {
  return (
    <Link href={`/academy/${c.slug}`} className="group block">
      <Cover src={c.coverUrl} alt="" label={c.title} ratio="aspect-[4/3]" />
      <p className="eyebrow mt-6">{c.category} · {c.lessonCount} lessons</p>
      <h3 className="display-sm mt-3 transition-colors group-hover:text-[var(--brand-accent)]">{c.title}</h3>
      {c.summary && <p className="mt-2 line-clamp-3 text-[var(--muted-ink)]">{c.summary}</p>}
      <p className="mt-4 text-sm font-semibold">{priceLabel(c.priceMinor, c.currency)}</p>
    </Link>
  );
}

export function ProductCard({ p }: { p: PublicProduct }) {
  return (
    <Link href={`/shop/${p.slug}`} className="group block">
      <Cover src={p.coverUrl} alt="" label={p.title} ratio="aspect-[3/4]" />
      <p className="eyebrow mt-5 capitalize">{p.kind}</p>
      <h3 className="display-sm mt-2 transition-colors group-hover:text-[var(--brand-accent)]">{p.title}</h3>
      <p className="mt-3 text-sm font-semibold">{p.isLeadMagnet ? "Free download" : priceLabel(p.priceMinor, p.currency)}</p>
    </Link>
  );
}

export function ArticleCard({ a, large = false }: { a: PublicArticle; large?: boolean }) {
  const date = new Date(a.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Link href={`/insights/${a.slug}`} className="group block">
      {(a.coverUrl || large) && <Cover src={a.coverUrl} alt="" label={a.title} ratio={large ? "aspect-[16/10]" : "aspect-[3/2]"} />}
      <p className="eyebrow mt-6">{a.categoryName ?? "Insight"} · {a.readingMinutes} min read</p>
      <h3 className={`${large ? "display-md" : "display-sm"} mt-3 transition-colors group-hover:text-[var(--brand-accent)]`}>{a.title}</h3>
      {a.excerpt && <p className="mt-3 line-clamp-3 leading-relaxed text-[var(--muted-ink)]">{a.excerpt}</p>}
      <p className="mt-4 text-xs text-[var(--muted-ink)]"><time dateTime={a.publishedAt}>{date}</time></p>
    </Link>
  );
}
