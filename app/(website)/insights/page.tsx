import type { Metadata } from "next";
import Link from "next/link";
import { getPublicArticles } from "@/features/website/application/public-queries";
import { categories } from "@/features/content/application/articles";
import { PageHeader, EmptyState } from "@/components/website/page-header";
import { ArticleCard } from "@/components/website/cards";

export const metadata: Metadata = { title: "Insights", alternates: { canonical: "/insights" } };

type SP = Promise<{ q?: string; category?: string; tag?: string; page?: string }>;

export default async function InsightsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.slice(0, 100);
  const [articles, cats] = await Promise.all([
    getPublicArticles({ q, category: sp.category, tag: sp.tag, page, limit: 13 }),
    categories(),
  ]);
  const hasMore = articles.length === 13;
  const list = articles.slice(0, 12);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q, category: sp.category, tag: sp.tag, ...extra }).filter(([, v]) => v) as [string, string][]);
    return p.toString() ? `?${p}` : "";
  };
  const lead = page === 1 && !q && !sp.category && !sp.tag ? list[0] : null;
  return (
    <>
      <PageHeader eyebrow="Insights" title="Notes on *visibility*, voice and authority">
        <form role="search" className="mt-2 flex gap-2" action="/insights">
          <label htmlFor="q" className="sr-only">Search articles</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search insights" className="field" />
          <button className="btn btn-primary !px-5">Search</button>
        </form>
      </PageHeader>
      {cats.length > 0 && (
        <nav aria-label="Categories" className="site-container -mt-6 mb-14 flex flex-wrap gap-2">
          <Link href="/insights" className={`border px-4 py-2 text-sm ${!sp.category ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)]"}`}>All</Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/insights?category=${c.slug}`} className={`border px-4 py-2 text-sm ${sp.category === c.slug ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)]"}`}>{c.name}</Link>
          ))}
        </nav>
      )}
      {!list.length ? (
        <EmptyState title={q ? `No results for “${q}”.` : "No articles yet."} body={q ? "Try a different search term." : undefined} />
      ) : (
        <div className="site-container pb-28">
          {lead && <div className="mb-20 border-b border-[var(--line)] pb-20"><ArticleCard a={lead} large /></div>}
          <div className="grid gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
            {(lead ? list.slice(1) : list).map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
          <nav aria-label="Pagination" className="mt-20 flex justify-between">
            {page > 1 ? <Link className="btn btn-link" href={`/insights${qs({ page: String(page - 1) })}`}>← Newer</Link> : <span />}
            {hasMore && <Link className="btn btn-link" href={`/insights${qs({ page: String(page + 1) })}`}>Older →</Link>}
          </nav>
        </div>
      )}
    </>
  );
}
