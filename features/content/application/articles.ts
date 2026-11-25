import "server-only";
import { UserError } from "@/lib/errors";
import { z } from "zod";
import { db, tx } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { isRichDoc, plainText, readingMinutes } from "../domain/rich-text";
import { slugify } from "@/lib/slug";

export type ArticleRow = {
  id: string; slug: string; title: string; excerpt: string; body: unknown; cover_media_id: string | null; cover_key?: string | null;
  video_url: string | null; category_id: string | null; category_name?: string | null; category_slug?: string | null;
  author_name: string; featured: boolean; status: "draft" | "scheduled" | "published" | "archived";
  scheduled_at: Date | null; published_at: Date | null; seo: { title?: string; description?: string; ogImageUrl?: string };
  reading_minutes: number; updated_at: Date; created_at: Date; is_demo: boolean; tags?: string[];
};

export class ArticleError extends UserError {}

export const articleInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(250),
  slug: z.string().trim().max(120).optional().default(""),
  excerpt: z.string().trim().max(600).default(""),
  body: z.unknown().refine(isRichDoc, "Invalid article body"),
  coverMediaId: z.string().uuid().nullable().optional(),
  videoUrl: z.string().trim().max(300).refine((v) => v === "" || /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(v), "Only YouTube/Vimeo links").default(""),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  authorName: z.string().trim().max(120).default(""),
  featured: z.boolean().default(false),
  seoTitle: z.string().trim().max(80).default(""),
  seoDescription: z.string().trim().max(300).default(""),
});
export type ArticleInput = z.infer<typeof articleInput>;

const SELECT = `select a.*, m.storage_key as cover_key, c.name as category_name, c.slug as category_slug,
  coalesce((select array_agg(t.name order by t.name) from article_tags at join tags t on t.id = at.tag_id where at.article_id = a.id), '{}') as tags
  from articles a left join media_assets m on m.id = a.cover_media_id left join content_categories c on c.id = a.category_id`;

export async function saveArticle(id: string | null, raw: unknown, actorId: string): Promise<string> {
  const input = articleInput.parse(raw);
  const text = plainText(input.body);
  const slug = slugify(input.slug || input.title);
  if (!slug) throw new ArticleError("Please provide a title.");
  return tx(async (t) => {
    let articleId = id;
    const params = [input.title, slug, input.excerpt, JSON.stringify(input.body), text, input.coverMediaId ?? null, input.videoUrl || null,
      input.categoryId ?? null, input.authorName, input.featured, JSON.stringify({ title: input.seoTitle, description: input.seoDescription }), readingMinutes(text)];
    try {
      await t.query("savepoint art");
      if (articleId) {
        const prev = await t.one<{ title: string; body: unknown }>("select title, body from articles where id = $1 for update", [articleId]);
        if (!prev) throw new ArticleError("Article not found.");
        await t.query(
          `update articles set title=$1, slug=$2, excerpt=$3, body=$4, body_text=$5, cover_media_id=$6, video_url=$7, category_id=$8,
             author_name=$9, featured=$10, seo=$11, reading_minutes=$12 where id = $13`,
          [...params, articleId],
        );
        // Keep a revision when content meaningfully changes (cap 30 per article).
        if (JSON.stringify(prev.body) !== JSON.stringify(input.body) || prev.title !== input.title) {
          await t.query("insert into article_revisions (article_id, title, body, created_by) values ($1,$2,$3,$4)", [articleId, prev.title, JSON.stringify(prev.body), actorId]);
          await t.query(`delete from article_revisions where article_id = $1 and id not in (select id from article_revisions where article_id = $1 order by created_at desc limit 30)`, [articleId]);
        }
      } else {
        const row = await t.one<{ id: string }>(
          `insert into articles (title, slug, excerpt, body, body_text, cover_media_id, video_url, category_id, author_name, featured, seo, reading_minutes, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
          [...params, actorId],
        );
        articleId = row!.id;
      }
      await t.query("release savepoint art");
    } catch (e) {
      await t.query("rollback to savepoint art");
      if ((e as { code?: string }).code === "23505") throw new ArticleError("Another article already uses this URL slug.");
      throw e;
    }
    await t.query("delete from article_tags where article_id = $1", [articleId]);
    for (const name of input.tags) {
      const tagSlug = slugify(name);
      if (!tagSlug) continue;
      const tag = await t.one<{ id: string }>(
        "insert into tags (name, slug) values ($1, $2) on conflict (slug) do update set name = tags.name returning id",
        [name, tagSlug],
      );
      await t.query("insert into article_tags (article_id, tag_id) values ($1,$2) on conflict do nothing", [articleId, tag!.id]);
    }
    return articleId!;
  });
}

export async function setArticleStatus(id: string, action: "publish" | "unpublish" | "archive" | "schedule", actorId: string | null, when?: Date) {
  if (action === "publish") {
    await db.query(`update articles set status = 'published', published_at = coalesce(published_at, now()), scheduled_at = null where id = $1`, [id]);
  } else if (action === "schedule") {
    if (!when || when.getTime() < Date.now() + 60_000) throw new ArticleError("Choose a future publish time.");
    await db.query(`update articles set status = 'scheduled', scheduled_at = $2 where id = $1`, [id, when]);
  } else if (action === "unpublish") {
    await db.query(`update articles set status = 'draft', scheduled_at = null where id = $1`, [id]);
  } else {
    await db.query(`update articles set status = 'archived', scheduled_at = null where id = $1`, [id]);
  }
  await audit({ actorId, actorLabel: actorId ? undefined : "scheduler", action: `article.${action}`, entityType: "article", entityId: id });
}

export async function publishDueArticles(): Promise<number> {
  const rows = await db.query(
    `update articles set status = 'published', published_at = scheduled_at, scheduled_at = null
      where status = 'scheduled' and scheduled_at <= now() returning id`,
  );
  return rows.length;
}

export const articleById = (id: string) => db.one<ArticleRow>(`${SELECT} where a.id = $1`, [id]);

export async function listArticlesAdmin(opts: { q?: string; status?: string } = {}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.q) { params.push(opts.q); where.push(`a.search @@ plainto_tsquery('english', $${params.length})`); }
  if (opts.status) { params.push(opts.status); where.push(`a.status = $${params.length}`); }
  return db.query<ArticleRow>(`${SELECT} ${where.length ? "where " + where.join(" and ") : ""} order by a.updated_at desc limit 200`, params);
}

// ---------------- Public queries (published only) ----------------
export async function publishedArticles(opts: { q?: string; category?: string; tag?: string; page?: number; featuredOnly?: boolean; limit?: number } = {}) {
  const params: unknown[] = [];
  const where = ["a.status = 'published'", "a.published_at <= now()"];
  if (opts.q) { params.push(opts.q); where.push(`a.search @@ websearch_to_tsquery('english', $${params.length})`); }
  if (opts.category) { params.push(opts.category); where.push(`c.slug = $${params.length}`); }
  if (opts.tag) { params.push(opts.tag); where.push(`exists (select 1 from article_tags at join tags t on t.id = at.tag_id where at.article_id = a.id and t.slug = $${params.length})`); }
  if (opts.featuredOnly) where.push("a.featured");
  const limit = opts.limit ?? 12;
  params.push(limit, ((opts.page ?? 1) - 1) * limit);
  return db.query<ArticleRow>(
    `${SELECT} where ${where.join(" and ")} order by a.featured desc, a.published_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

export const publishedArticle = (slug: string) =>
  db.one<ArticleRow>(`${SELECT} where a.slug = $1 and a.status = 'published' and a.published_at <= now()`, [slug]);

/** Related: shared tags first, then same category, then recent. */
export async function relatedArticles(articleId: string, categoryId: string | null, limit = 3) {
  return db.query<ArticleRow>(
    `${SELECT} where a.status = 'published' and a.id <> $1
      order by (select count(*) from article_tags x join article_tags y on x.tag_id = y.tag_id where x.article_id = a.id and y.article_id = $1) desc,
               (a.category_id is not distinct from $2) desc, a.published_at desc limit $3`,
    [articleId, categoryId, limit],
  );
}

export const categories = () => db.query<{ id: string; name: string; slug: string }>("select id, name, slug from content_categories order by name");
