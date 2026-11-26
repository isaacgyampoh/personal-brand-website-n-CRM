import { requireStaffPage } from "@/lib/auth/session";
import { listMedia, mediaUrl } from "@/features/media/application/media";
import { deleteMediaAction, updateMediaAction } from "@/features/media/presentation/actions";
import { getIntegration } from "@/lib/integrations/store";
import { PageTitle, Notice, Empty, Pager } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Submit } from "@/components/dashboard/forms";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";

export const metadata = { title: "Media" };

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ q?: string; visibility?: string; page?: string }> }) {
  await requireStaffPage("media:manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const visibility = sp.visibility === "private" ? "private" : sp.visibility === "public" ? "public" : undefined;
  const items = await listMedia({ q: sp.q, visibility, page });
  return (
    <div className="space-y-6">
      <PageTitle title="Media library" description="Images are converted to WebP, resized, and stripped of location metadata. Private files are only ever served through short-lived signed links." />
      {!(await getIntegration("r2")).usable && <Notice>Using local server storage. Connect Cloudflare R2 in Settings → Integrations before launch — large files never go into the database.</Notice>}
      <UploadDropzone />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search filename or alt text" className="h-9 rounded-lg border bg-background px-3 text-sm" aria-label="Search" />
        <select name="visibility" defaultValue={sp.visibility ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Visibility"><option value="">All</option><option value="public">Public</option><option value="private">Private</option></select>
        <button className="h-9 rounded-lg bg-foreground px-3 text-sm text-background">Filter</button>
      </form>
      {items.length === 0 ? <Empty title="No files" /> : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((m) => {
            const url = mediaUrl(m);
            return (
              <li key={m.id} className="overflow-hidden rounded-xl border bg-background">
                {m.mime_type.startsWith("image/") && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={m.alt_text} loading="lazy" className="aspect-square w-full object-cover" />
                ) : <div className="flex aspect-square items-center justify-center bg-muted text-xs font-semibold uppercase text-muted-foreground">{m.visibility === "private" ? "🔒 " : ""}{m.mime_type.split("/")[1]?.slice(0, 8)}</div>}
                <div className="space-y-2 p-3 text-xs">
                  <p className="truncate font-medium" title={m.filename}>{m.filename}</p>
                  <p className="text-muted-foreground">{m.visibility} · {(m.size_bytes / 1024).toFixed(0)} KB{m.width ? ` · ${m.width}×${m.height}` : ""}</p>
                  <details>
                    <summary className="cursor-pointer underline">Edit</summary>
                    <ActionForm action={updateMediaAction} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={m.id} />
                      <Field label="Alt text" name="altText" defaultValue={m.alt_text} />
                      <Field label="Category" name="category" defaultValue={m.category} />
                      <Submit variant="outline" className="h-8 text-xs">Save</Submit>
                    </ActionForm>
                    {url && <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{url}</p>}
                    <div className="mt-2"><ActionButton action={deleteMediaAction} fields={{ id: m.id }} label="Delete" variant="destructive" confirm="Delete this file?" /></div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} hasMore={items.length === 48} base={`/admin/media?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(visibility ? { visibility } : {}) })}`} />
    </div>
  );
}
