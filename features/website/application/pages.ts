import "server-only";
import { UserError } from "@/lib/errors";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { pageDataSchema, pageSeoSchema, type PageData, type PageSeo } from "@/features/website-builder/domain/blocks";

export type PageRow = {
  id: string; slug: string; title: string; kind: "home" | "standard" | "landing" | "legal" | "system";
  status: "draft" | "published" | "scheduled" | "archived"; draft_content: PageData; published_content: PageData | null;
  seo: PageSeo; requires_legal_review: boolean; scheduled_publish_at: Date | null; published_at: Date | null;
  updated_at: Date; is_demo: boolean;
};

export class PageError extends UserError {}

export const listPages = () =>
  db.query<PageRow>("select * from pages order by case kind when 'home' then 0 when 'standard' then 1 when 'landing' then 2 else 3 end, title");

export const pageById = (id: string) => db.one<PageRow>("select * from pages where id = $1", [id]);

/** Published content only — drafts never reach the public site. */
export async function publishedPage(slug: string): Promise<Pick<PageRow, "id" | "slug" | "title" | "kind" | "published_content" | "seo" | "published_at" | "requires_legal_review"> | null> {
  return db.one(
    `select id, slug, title, kind, published_content, seo, published_at, requires_legal_review from pages
      where slug = $1 and published_content is not null and status in ('published','scheduled')`,
    [slug],
  );
}

export async function createPage(input: { title: string; slug: string; kind: "standard" | "landing" | "legal"; actorId: string }) {
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9/-]+/g, "-").replace(/^-+|-+$/g, "");
  const reserved = ["admin", "portal", "api", "login", "register", "book", "masterclasses", "academy", "shop", "insights", "services", "go", "media", "auth", "checkout", "links", "assessment", "contact", "case-studies", "testimonials", "certificates", "newsletter"];
  if (reserved.includes(slug.split("/")[0])) throw new PageError("That address is reserved by the website. Choose another.");
  const row = await db.one<{ id: string }>(
    "insert into pages (title, slug, kind, status, requires_legal_review, updated_by) values ($1,$2,$3,'draft',$4,$5) returning id",
    [input.title, slug, input.kind, input.kind === "legal", input.actorId],
  ).catch((e) => {
    if ((e as { code?: string }).code === "23505") throw new PageError("A page with that address already exists.");
    if ((e as { code?: string }).code === "23514") throw new PageError("Use lowercase letters, numbers and hyphens for the address.");
    throw e;
  });
  await audit({ actorId: input.actorId, action: "page.create", entityType: "page", entityId: row!.id });
  return row!.id;
}

/** Saves a draft. Validated against the block schemas; never touches published content. */
export async function saveDraft(pageId: string, content: unknown, seo: unknown, actorId: string) {
  const parsed = pageDataSchema.safeParse(content);
  if (!parsed.success) throw new PageError(`Some blocks have invalid content: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  const seoParsed = pageSeoSchema.parse(seo ?? {});
  await db.query(
    "update pages set draft_content = $2, seo = $3, updated_by = $4 where id = $1",
    [pageId, JSON.stringify(parsed.data), JSON.stringify(seoParsed), actorId],
  );
}

export async function publishPage(pageId: string, actorId: string | null, note = "Published") {
  await tx(async (t) => {
    const page = await t.one<PageRow>("select * from pages where id = $1 for update", [pageId]);
    if (!page) throw new PageError("Page not found.");
    const content = pageDataSchema.parse(page.draft_content);
    await t.query(
      `update pages set published_content = $2, status = 'published', published_at = now(), scheduled_publish_at = null, updated_by = coalesce($3, updated_by)
       where id = $1`,
      [pageId, JSON.stringify(content), actorId],
    );
    await t.query(
      "insert into page_revisions (page_id, content, seo, kind, note, created_by) values ($1,$2,$3,'publish',$4,$5)",
      [pageId, JSON.stringify(content), JSON.stringify(page.seo), note, actorId],
    );
    await audit({ actorId, actorLabel: actorId ? undefined : "scheduler", action: "page.publish", entityType: "page", entityId: pageId }, t);
  });
}

export async function schedulePublish(pageId: string, when: Date, actorId: string) {
  if (when.getTime() < Date.now() + 60_000) throw new PageError("Choose a time at least a minute in the future.");
  await db.query(
    `update pages set status = 'scheduled', scheduled_publish_at = $2 where id = $1`,
    [pageId, when],
  );
  await audit({ actorId, action: "page.schedule", entityType: "page", entityId: pageId, data: { when } });
}

export async function unpublishPage(pageId: string, actorId: string) {
  const page = await pageById(pageId);
  if (page?.kind === "home") throw new PageError("The homepage can't be unpublished. Edit and republish it instead.");
  await db.query("update pages set status = 'draft', published_content = null, scheduled_publish_at = null where id = $1", [pageId]);
  await audit({ actorId, action: "page.unpublish", entityType: "page", entityId: pageId });
}

export const pageRevisions = (pageId: string) =>
  db.query<{ id: string; kind: string; note: string | null; created_at: Date; created_by_name: string | null }>(
    `select r.id, r.kind, r.note, r.created_at, u.full_name as created_by_name
       from page_revisions r left join users u on u.id = r.created_by where r.page_id = $1 order by r.created_at desc limit 50`,
    [pageId],
  );

/** Restores a revision into the DRAFT (publish separately). */
export async function restoreRevision(pageId: string, revisionId: string, actorId: string) {
  await tx(async (t) => {
    const rev = await t.one<{ content: unknown; seo: unknown }>("select content, seo from page_revisions where id = $1 and page_id = $2", [revisionId, pageId]);
    if (!rev) throw new PageError("Revision not found.");
    const current = await t.one<{ draft_content: unknown; seo: unknown }>("select draft_content, seo from pages where id = $1", [pageId]);
    await t.query("insert into page_revisions (page_id, content, seo, kind, note, created_by) values ($1,$2,$3,'draft_snapshot','Before restore',$4)",
      [pageId, JSON.stringify(current!.draft_content), JSON.stringify(current!.seo), actorId]);
    await t.query("update pages set draft_content = $2, seo = $3 where id = $1", [pageId, JSON.stringify(rev.content), JSON.stringify(rev.seo)]);
    await audit({ actorId, action: "page.restore", entityType: "page", entityId: pageId, data: { revisionId } }, t);
  });
}

/** Scheduler: publishes due pages. Returns how many were published. */
export async function publishDuePages(): Promise<number> {
  const due = await db.query<{ id: string }>("select id from pages where status = 'scheduled' and scheduled_publish_at <= now()");
  for (const p of due) await publishPage(p.id, null, "Scheduled publish");
  return due.length;
}
