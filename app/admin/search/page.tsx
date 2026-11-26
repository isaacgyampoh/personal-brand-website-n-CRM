import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { globalSearch } from "@/features/studio/application/search";
import { PageTitle, Empty } from "@/components/dashboard/ui";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireStaffPage("dashboard:view", "/admin/search");
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const hits = await globalSearch(user, q);
  const groups = [...new Set(hits.map((h) => h.kind))];
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Search" description="Contacts, orders, receipts, payment references, appointments, masterclasses, registrations, courses, products and articles." />
      <form action="/admin/search" role="search">
        <label htmlFor="gs" className="sr-only">Search everything</label>
        <input id="gs" name="q" defaultValue={q} autoFocus placeholder="Name, email, phone, order or receipt number…" className="h-11 w-full rounded-lg border bg-background px-4 text-sm" />
      </form>
      {q.length >= 2 && hits.length === 0 && <Empty title="Nothing found" body={`No results for “${q}”.`} />}
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}s</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {hits.filter((h) => h.kind === g).map((h) => (
              <li key={h.href + h.title}><Link href={h.href} className="block px-4 py-3 hover:bg-muted/60"><span className="text-sm font-medium">{h.title}</span><span className="block text-xs text-muted-foreground">{h.detail}</span></Link></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
