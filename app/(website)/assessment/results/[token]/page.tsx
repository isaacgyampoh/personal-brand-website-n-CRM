import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assessmentResult } from "@/features/marketing/application/assessments";

export const metadata: Metadata = { title: "Your results", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Results({ params }: { params: Promise<{ token: string }> }) {
  const r = await assessmentResult((await params).token);
  if (!r) notFound();
  const cats = Object.entries(r.scores.categories).filter(([, c]) => c.max > 0);
  return (
    <div className="site-container max-w-4xl pb-28 pt-10 md:pt-16">
      <p className="eyebrow eyebrow-rule">{r.title}</p>
      <div className="mt-8 grid gap-10 md:grid-cols-[auto_1fr] md:items-end">
        <p className="font-display text-[7rem] leading-none tracking-tight">{r.overall_percent}<span className="text-4xl text-[var(--muted-ink)]">%</span></p>
        <div>{r.scores.band && <><h1 className="display-md">{r.scores.band.title}</h1><p className="lede mt-4">{r.scores.band.recommendation}</p></>}</div>
      </div>
      <ul className="mt-16 space-y-6">
        {cats.map(([k, c]) => (
          <li key={k}>
            <div className="flex justify-between text-sm"><span className="font-semibold">{c.label}</span><span>{c.percent}%</span></div>
            <div className="mt-2 h-1.5 bg-[var(--line)]" role="meter" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}><div className="h-1.5 bg-[var(--brand-accent)]" style={{ width: `${c.percent}%` }} /></div>
            {c.advice && <p className="mt-2 text-sm text-[var(--muted-ink)]">{c.advice}</p>}
          </li>
        ))}
      </ul>
      <div className="tone-ink mt-20 p-10 md:p-14">
        <p className="eyebrow">Next step</p>
        <p className="display-md mt-4">Turn these results into a plan.</p>
        <p className="lede mt-4 max-w-xl">Book a strategy conversation to walk through your scores and the three moves that will make the biggest difference.</p>
        <Link href="/book" className="btn btn-accent mt-8">Book a consultation</Link>
      </div>
    </div>
  );
}
