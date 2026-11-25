/**
 * Removes demonstration content before production. Demo rows that have real
 * transactions attached (orders/registrations) are archived instead of deleted.
 */
import { closePool, tx } from "@/lib/database/pool";

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
    await t.query(`delete from settings where key in ('brand','seo','contact') and value::text like '%Demo%'`);
  });
  console.log("Demo content removed or archived. Review Admin → Website before launch.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closePool());
