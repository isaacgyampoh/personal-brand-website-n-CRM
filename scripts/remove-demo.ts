/**
 * Removes demonstration content before production. Demo rows that have real
 * transactions attached (orders/registrations) are archived instead of deleted.
 */
import { closePool, db, tx } from "@/lib/database/pool";
import { storage } from "@/lib/storage";
import { requestRevalidation } from "@/features/automation/application/scheduled";

async function main() {
  await tx(async (t) => {
    await t.query(`update pages set draft_content = '{"root":{"props":{}},"content":[]}', published_content = null, status = 'draft', is_demo = false where is_demo`);
    await t.query(`delete from articles where is_demo`);
    await t.query(`delete from speaking_topics where title like '%(Demo)'`);
    await t.query(`update events set status = 'cancelled' where is_demo and exists (select 1 from event_registrations r where r.event_id = events.id)`);
    await t.query(`delete from events where is_demo and not exists (select 1 from event_registrations r where r.event_id = events.id)`);
    await t.query(`update courses set status = 'archived' where is_demo and exists (select 1 from enrolments e where e.course_id = courses.id)`);
    await t.query(`delete from courses where is_demo and not exists (select 1 from enrolments e where e.course_id = courses.id)`);
    await t.query(`update products set status = 'archived' where is_demo and exists (select 1 from entitlements e where e.resource_id = products.id)`);
    await t.query(`delete from products where is_demo and not exists (select 1 from entitlements e where e.resource_id = products.id)`);
    await t.query(`update services set is_active = false where is_demo and exists (select 1 from appointments a where a.service_id = services.id)`);
    await t.query(`delete from services where is_demo and not exists (select 1 from appointments a where a.service_id = services.id)`);
    await t.query(`delete from contacts where is_demo and not exists (select 1 from orders o where o.contact_id = contacts.id)`);
    await t.query(`delete from assessments where is_demo and not exists (select 1 from assessment_responses r where r.assessment_id = assessments.id)`);
    await t.query(`delete from content_categories c where slug in ('visibility','linkedin') and not exists (select 1 from articles a where a.category_id = c.id)`);
    await t.query(`delete from settings where key in ('brand','seo','contact') and value::text like '%Demo%'`);
    await t.query(`update settings set value = value || '{"email": ""}' where key = 'contact' and value->>'email' like '%@example.%'`);
  });
  // Demonstration files (workbook/checklist PDFs) leave the media library and storage too.
  const files = await db.query<{ id: string; storage_key: string; visibility: "public" | "private" }>(
    `update media_assets set deleted_at = now() where deleted_at is null and filename like 'demo-%'
       and not exists (select 1 from products p where p.file_media_id = media_assets.id or p.cover_media_id = media_assets.id)
     returning id, storage_key, visibility`);
  const store = await storage();
  for (const f of files) await store.remove(f.storage_key, f.visibility).catch(() => undefined);
  await requestRevalidation(["settings", "pages", "articles", "services", "events", "courses", "products", "proof"]).catch(() => console.warn("Cache refresh failed — restart the web app."));
  console.log("Demo content removed or archived. Review Admin → Website before launch.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closePool());
