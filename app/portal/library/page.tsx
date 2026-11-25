import { requireUser } from "@/lib/auth/session";
import { myLibrary } from "@/features/portal/application/portal";
import { downloadAction } from "@/features/portal/presentation/actions";
import Link from "next/link";

export const metadata = { title: "Library" };

export default async function Library() {
  const user = await requireUser("/portal/library");
  const items = await myLibrary(user.id);
  return (
    <div className="space-y-8">
      <h1 className="display-lg">Your library</h1>
      {items.length ? (
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {items.map((p) => {
            const left = p.download_limit === null ? null : Math.max(0, p.download_limit - p.downloads);
            return (
              <li key={p.entitlement_id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                <span><span className="display-sm block">{p.title}</span><span className="text-sm capitalize text-[var(--muted-ink)]">{p.kind}{left !== null ? ` · ${left} download(s) left` : ""}</span></span>
                <form action={downloadAction}><input type="hidden" name="entitlementId" value={p.entitlement_id} /><button className="btn btn-primary" disabled={left === 0}>Download</button></form>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[var(--muted-ink)]">No downloads yet. <Link href="/shop" className="underline">Browse resources</Link>.</p>}
      <p className="text-xs text-[var(--muted-ink)]">Download links are generated securely and expire after a few minutes.</p>
    </div>
  );
}
