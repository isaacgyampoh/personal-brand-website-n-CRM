/**
 * DEMONSTRATION content for development and design review.
 * Every row is flagged is_demo = true and titled/labelled as demo, so it can be
 * removed with `pnpm db:demo:remove`. It contains NO testimonials, statistics,
 * client logos, qualifications or achievements — those must come from the client.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { db, closePool, tx } from "@/lib/database/pool";
import { uploadMedia } from "@/features/media/application/media";
import { docFromText } from "@/features/content/domain/rich-text";
import { fromWallClock, toWallClock, addDaysToKey, dateKey } from "@/lib/time";

const TZ = "Africa/Accra";
const at = (daysFromNow: number, hour: number, minute = 0) => {
  const key = addDaysToKey(dateKey(new Date(), TZ), daysFromNow);
  const [y, m, d] = key.split("-").map(Number);
  return fromWallClock({ year: y, month: m, day: d, hour, minute }, TZ);
};

const home = {
  root: { props: {} },
  content: [
    { type: "Hero", props: { id: "hero", variant: "statement", eyebrow: "Demo · Personal brand strategist", headline: "Be the name they *remember*", emphasis: "", body: "Demonstration copy. Replace in Website Studio with the client's own positioning statement — strategy, voice and visibility for professionals who are ready to lead in public.", primaryCta: { label: "Book a consultation", href: "/book" }, secondaryCta: { label: "Explore masterclasses", href: "/masterclasses" }, imageUrl: "", imageAlt: "", videoUrl: "", tone: "paper" } },
    { type: "Statement", props: { id: "statement", statement: "Demo statement: a personal brand is the *promise* people feel before you enter the room.", attribution: "Demonstration content", tone: "surface" } },
    { type: "Introduction", props: { id: "intro", eyebrow: "About", heading: "Strategy for people whose *work* deserves to be seen", body: "This paragraph is demonstration content written to show the layout. The client's real biography, career journey and philosophy go here.\n\nUse short paragraphs, a confident voice and a clear point of view — the design is built to give writing room to breathe.", signature: "", imageUrl: "", imageAlt: "", cta: { label: "More about the approach", href: "/about" }, tone: "paper" } },
    { type: "Services", props: { id: "services", eyebrow: "Work together", heading: "Ways to *begin*", intro: "Demo services — edit or replace them in Admin → Services.", source: "featured", limit: 3, cta: { label: "All services", href: "/services" }, tone: "paper" } },
    { type: "Events", props: { id: "events", eyebrow: "Masterclasses", heading: "Learn *live*", intro: "Upcoming sessions are pulled automatically from Admin → Masterclasses.", limit: 3, cta: { label: "All masterclasses", href: "/masterclasses" }, tone: "surface" } },
    { type: "Courses", props: { id: "courses", eyebrow: "Academy", heading: "Self-paced *programmes*", intro: "", limit: 3, cta: { label: "Visit the academy", href: "/academy" }, tone: "paper" } },
    { type: "Testimonials", props: { id: "testimonials", eyebrow: "Kind words", heading: "In their words", limit: 3, featuredOnly: false, tone: "paper" } },
    { type: "Articles", props: { id: "articles", eyebrow: "Insights", heading: "Recent *thinking*", limit: 3, featuredOnly: false, cta: { label: "All insights", href: "/insights" }, tone: "paper" } },
    { type: "Newsletter", props: { id: "newsletter", eyebrow: "Newsletter", heading: "A letter worth *opening*", body: "Demo copy: one thoughtful note a fortnight on visibility, voice and authority.", buttonLabel: "Subscribe", tone: "surface" } },
    { type: "CallToAction", props: { id: "cta", eyebrow: "Next step", heading: "Ready to be *seen*?", body: "Demo closing call to action.", primaryCta: { label: "Book a consultation", href: "/book" }, secondaryCta: { label: "Ask a question", href: "/contact" }, tone: "ink" } },
  ],
};

async function demoPdf(title: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`${title} (demonstration file)`, { x: 50, y: 780, size: 18, font });
  page.drawText("Replace this file with the real product in Admin -> Shop.", { x: 50, y: 750, size: 11, font });
  return Buffer.from(await pdf.save());
}

async function main() {
  const owner = await db.one<{ id: string }>("select id from users where role in ('owner','admin') order by created_at limit 1");
  if (!owner) throw new Error("Create an owner first: pnpm create-owner --email you@example.com --name \"Your Name\"");

  await tx(async (t) => {
    await t.query(
      `insert into settings (key, value) values
        ('brand', $1), ('seo', $2), ('contact', $3)
       on conflict (key) do nothing`,
      [
        JSON.stringify({ name: "Demo Studio", professionalTitle: "Personal Brand Strategist (demo)", tagline: "Demonstration site — replace in Settings → Brand.", shortBio: "", logoUrl: "", logoText: "", portraitUrl: "", portraitAlt: "" }),
        JSON.stringify({ titleTemplate: "%s | Demo Studio", defaultTitle: "Demo Studio", defaultDescription: "Demonstration content.", ogImageUrl: "", xHandle: "", indexable: false }),
        JSON.stringify({ email: "hello@example.com", phone: "", address: "", city: "Accra", country: "Ghana", bookingNote: "" }),
      ],
    );
    await t.query(
      `update pages set draft_content = $1, published_content = $1, status = 'published', published_at = now(), is_demo = true where slug = 'home'`,
      [JSON.stringify(home)],
    );
    await t.query(
      `update pages set draft_content = $1, published_content = $1, status = 'published', published_at = now(), is_demo = true where slug = 'about'`,
      [JSON.stringify({ root: { props: {} }, content: [
        { type: "Hero", props: { id: "ah", variant: "statement", eyebrow: "About (demo)", headline: "A considered approach to *visibility*", emphasis: "", body: "Demonstration about page. Replace with the client's story.", primaryCta: { label: "", href: "" }, secondaryCta: { label: "", href: "" }, imageUrl: "", imageAlt: "", videoUrl: "", tone: "paper" } },
        { type: "EditorialText", props: { id: "ae", eyebrow: "Philosophy", heading: "Clarity before *content*", body: "Demo paragraph explaining a philosophy.\n\nA second demo paragraph.", aside: "", layout: "single", tone: "surface" } },
      ] })],
    );

    const services = [
      ["demo-brand-clarity-session", "Brand Clarity Session (Demo)", 0, 45, true, "Demo: a focused complimentary conversation to identify your next move."],
      ["demo-linkedin-strategy-intensive", "LinkedIn Strategy Intensive (Demo)", 150000, 90, true, "Demo: a deep-dive into positioning, profile and content plan."],
      ["demo-executive-presence", "Executive Presence Programme (Demo)", 750000, 60, true, "Demo: private mentorship for senior leaders."],
    ] as const;
    for (const [slug, name, price, dur, featured, summary] of services) {
      await t.query(
        `insert into services (slug, name, summary, description, price_minor, duration_minutes, featured, is_demo, cancellation_policy)
         values ($1,$2,$3,$4,$5,$6,$7,true,'Demo policy: free cancellation up to 24 hours before your session.') on conflict (slug) do nothing`,
        [slug, name, summary, JSON.stringify(docFromText(`${summary}\n\nThis is demonstration content.`)), price, dur, featured],
      );
    }

    const ev = await t.one<{ id: string }>(
      `insert into events (slug, title, subtitle, kind, format, summary, description, starts_at, ends_at, capacity, status, published_at, is_demo, speakers, agenda, faqs)
       values ('demo-linkedin-authority-masterclass', 'LinkedIn Authority Masterclass (Demo)', 'A live, practical session — demonstration event.', 'masterclass', 'online',
         'Demo: build a profile and content rhythm that earns trust.', $1, $2, $3, 40, 'published', now(), true, $4, $5, $6)
       on conflict (slug) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at returning id`,
      [JSON.stringify(docFromText("Demonstration event description.\n\nReplace with the real masterclass details.")), at(10, 18), at(10, 20), JSON.stringify([{ name: "Demo Host", title: "Demonstration speaker" }]),
       JSON.stringify([{ time: "18:00", title: "Welcome & framing" }, { time: "18:20", title: "Positioning workshop" }, { time: "19:30", title: "Q&A" }]),
       JSON.stringify([{ q: "Will there be a recording?", a: "Demo answer: yes, for registered attendees." }])],
    );
    await t.query("delete from ticket_types where event_id = $1 and not exists (select 1 from event_registrations r where r.ticket_type_id = ticket_types.id)", [ev!.id]);
    await t.query(
      `insert into ticket_types (event_id, name, description, price_minor, sales_end_at, position) values
        ($1, 'Early bird (Demo)', 'Demo early-bird price', 25000, $2, 0),
        ($1, 'Standard (Demo)', '', 40000, null, 1)`,
      [ev!.id, at(5, 23, 59)],
    );
    await t.query(
      `insert into event_access (event_id, meeting_provider, meeting_url, instructions) values ($1, 'manual', 'https://example.com/demo-meeting', 'Demo joining instructions.')
       on conflict (event_id) do nothing`,
      [ev!.id],
    );
    const free = await t.one<{ id: string }>(
      `insert into events (slug, title, kind, format, summary, starts_at, ends_at, capacity, status, published_at, is_demo)
       values ('demo-open-office-hours', 'Open Office Hours (Demo)', 'webinar', 'online', 'Demo: a free monthly Q&A.', $1, $2, 100, 'published', now(), true)
       on conflict (slug) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at returning id`,
      [at(17, 12), at(17, 13)],
    );
    await t.query(`insert into ticket_types (event_id, name, price_minor) select $1, 'Free (Demo)', 0 where not exists (select 1 from ticket_types where event_id = $1)`, [free!.id]);

    const course = await t.one<{ id: string }>(
      `insert into courses (slug, title, subtitle, summary, description, price_minor, status, published_at, is_demo, outcomes, category)
       values ('demo-personal-brand-foundations', 'Personal Brand Foundations (Demo)', 'A self-paced demonstration programme', 'Demo: define your positioning, voice and story.', $1, 90000, 'published', now(), true, $2, 'branding')
       on conflict (slug) do update set title = excluded.title returning id`,
      [JSON.stringify(docFromText("Demonstration course description.")), ["Define your positioning (demo)", "Write a profile that converts (demo)", "Plan 30 days of content (demo)"]],
    );
    const hasModules = await t.one("select 1 from course_modules where course_id = $1", [course!.id]);
    if (!hasModules) {
      for (const [mi, mt] of ["Positioning", "Story & voice"].entries()) {
        const mod = await t.one<{ id: string }>("insert into course_modules (course_id, title, position) values ($1,$2,$3) returning id", [course!.id, `${mt} (Demo)`, mi]);
        for (let li = 0; li < 3; li++) {
          await t.query(
            `insert into lessons (course_id, module_id, title, kind, body, is_preview, position, duration_seconds) values ($1,$2,$3,'text',$4,$5,$6,$7)`,
            [course!.id, mod!.id, `Lesson ${mi + 1}.${li + 1} (Demo)`, JSON.stringify(docFromText(`Demonstration lesson content for lesson ${mi + 1}.${li + 1}.`)), mi === 0 && li === 0, li, 600],
          );
        }
      }
      const last = await t.one<{ id: string }>("select l.id from lessons l join course_modules m on m.id = l.module_id where l.course_id = $1 order by m.position desc, l.position desc limit 1", [course!.id]);
      await t.query(`update lessons set kind = 'quiz', title = 'Check your understanding (Demo)' where id = $1`, [last!.id]);
      await t.query(
        `insert into quizzes (lesson_id, pass_percent, questions) values ($1, 60, $2)`,
        [last!.id, JSON.stringify([
          { id: "q1", prompt: "Demo: what comes first?", options: [{ id: "a", label: "Positioning", correct: true }, { id: "b", label: "Posting daily", correct: false }] },
          { id: "q2", prompt: "Demo: a strong profile headline is…", options: [{ id: "a", label: "Specific about who you help", correct: true }, { id: "b", label: "A list of job titles", correct: false }] },
        ])],
      );
    }

    await t.query(`insert into content_categories (name, slug) values ('Visibility', 'visibility'), ('LinkedIn', 'linkedin') on conflict do nothing`);
    const cat = await t.one<{ id: string }>("select id from content_categories where slug = 'linkedin'");
    for (const [i, title] of ["Why positioning beats posting (Demo)", "Three profile edits that compound (Demo)", "Writing in your own voice (Demo)"].entries()) {
      const slug = `demo-article-${i + 1}`;
      const body = docFromText(`This is demonstration article content.\n\nIt shows how long-form writing looks on the site. Replace it in Admin → Content.\n\nA third paragraph for rhythm.`);
      await t.query(
        `insert into articles (slug, title, excerpt, body, body_text, category_id, status, published_at, featured, is_demo, author_name, reading_minutes)
         values ($1,$2,$3,$4,$5,$6,'published', now() - make_interval(days => $7), $8, true, 'Demo Author', 3) on conflict (slug) do nothing`,
        [slug, title, "Demonstration excerpt for layout review.", JSON.stringify(body), "demo", cat!.id, i * 6, i === 0],
      );
    }
    await t.query(`insert into speaking_topics (title, description, audience, formats, position) select 'Building authority online (Demo)', 'Demonstration speaking topic.', 'Professionals & leaders', '{Keynote,Workshop}', 0 where not exists (select 1 from speaking_topics)`);
  });

  const exists = await db.one("select 1 from products where slug = 'demo-linkedin-profile-workbook'");
  if (!exists) {
    const { asset } = await uploadMedia({ bytes: await demoPdf("LinkedIn Profile Workbook"), filename: "demo-workbook.pdf", visibility: "private", actorId: owner.id, category: "products" });
    await db.query(
      `insert into products (slug, title, kind, summary, description, file_media_id, price_minor, status, published_at, is_demo, download_limit)
       values ('demo-linkedin-profile-workbook', 'LinkedIn Profile Workbook (Demo)', 'workbook', 'Demo: a guided workbook.', $1, $2, 15000, 'published', now(), true, 5)`,
      [JSON.stringify(docFromText("Demonstration product description.")), asset.id],
    );
    const { asset: free } = await uploadMedia({ bytes: await demoPdf("Brand Clarity Checklist"), filename: "demo-checklist.pdf", visibility: "private", actorId: owner.id, category: "products" });
    await db.query(
      `insert into products (slug, title, kind, summary, file_media_id, price_minor, is_lead_magnet, status, published_at, is_demo)
       values ('demo-brand-clarity-checklist', 'Brand Clarity Checklist (Demo)', 'guide', 'Demo free download (lead magnet).', $1, 0, true, 'published', now(), true)`,
      [free.id],
    );
  }
  console.log("Demo content seeded (all rows flagged is_demo).");
  void toWallClock;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closePool());
