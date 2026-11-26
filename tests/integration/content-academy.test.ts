import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closePool } from "@/lib/database/pool";
import { saveDraft, publishPage, publishedPage, publishDuePages, schedulePublish, restoreRevision } from "@/features/website/application/pages";
import { saveArticle, setArticleStatus, publishDueArticles, publishedArticle } from "@/features/content/application/articles";
import { purchaseCatalogItem } from "@/features/commerce/application/purchase";
import { lessonForUser, markLessonComplete, submitQuiz, AcademyError } from "@/features/academy/application/learning";
import { verifyCertificate } from "@/features/academy/application/certificates";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { resetData } from "../helpers";

afterAll(() => closePool());
beforeEach(resetData);

async function staff() {
  return (await db.one<{ id: string }>("insert into users (email, role) values ('editor@example.com','owner') on conflict (email) do update set role='owner' returning id"))!.id;
}

const hero = (headline: string) => ({ root: { props: {} }, content: [{ type: "Hero", props: { id: "h", headline } }] });

describe("website publishing", () => {
  it("keeps drafts separate from the live page until published, and restores revisions", async () => {
    const actor = await staff();
    const page = await db.one<{ id: string }>("insert into pages (slug, title) values ('e2e-landing','Landing') on conflict (slug) do update set title = excluded.title returning id");
    await saveDraft(page!.id, hero("Version one"), {}, actor);
    expect(await publishedPage("e2e-landing")).toBeNull(); // nothing live yet
    await publishPage(page!.id, actor);
    await saveDraft(page!.id, hero("Version two (draft)"), {}, actor);
    const live = await publishedPage("e2e-landing");
    expect(JSON.stringify(live!.published_content)).toContain("Version one");
    expect(JSON.stringify(live!.published_content)).not.toContain("Version two");
    await publishPage(page!.id, actor);
    expect(JSON.stringify((await publishedPage("e2e-landing"))!.published_content)).toContain("Version two");
    const firstRev = await db.one<{ id: string }>("select id from page_revisions where page_id = $1 and kind = 'publish' order by created_at asc limit 1", [page!.id]);
    await restoreRevision(page!.id, firstRev!.id, actor);
    const row = await db.one<{ draft_content: unknown; published_content: unknown }>("select draft_content, published_content from pages where id = $1", [page!.id]);
    expect(JSON.stringify(row!.draft_content)).toContain("Version one");
    expect(JSON.stringify(row!.published_content)).toContain("Version two"); // restore affects draft only
  });

  it("rejects unsafe content in drafts", async () => {
    const actor = await staff();
    const page = await db.one<{ id: string }>("insert into pages (slug, title) values ('unsafe-test','Unsafe') on conflict (slug) do update set title = excluded.title returning id");
    await expect(saveDraft(page!.id, { content: [{ type: "CallToAction", props: { heading: "x", primaryCta: { label: "Go", href: "javascript:alert(1)" } } }] }, {}, actor)).rejects.toThrow(/invalid content/);
  });

  it("publishes scheduled pages and articles when due", async () => {
    const actor = await staff();
    const page = await db.one<{ id: string }>("insert into pages (slug, title) values ('scheduled-page','Scheduled') on conflict (slug) do update set title = excluded.title returning id");
    await saveDraft(page!.id, hero("Scheduled launch"), {}, actor);
    await schedulePublish(page!.id, new Date(Date.now() + 120_000), actor);
    expect(await publishDuePages()).toBe(0);
    await db.query("update pages set scheduled_publish_at = now() - interval '1 second' where id = $1", [page!.id]);
    expect(await publishDuePages()).toBe(1);
    expect(await publishedPage("scheduled-page")).not.toBeNull();

    const id = await saveArticle(null, { title: "Scheduled article", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] } }, actor);
    await setArticleStatus(id, "schedule", actor, new Date(Date.now() + 120_000));
    expect(await publishedArticle("scheduled-article")).toBeNull();
    await db.query("update articles set scheduled_at = now() - interval '1 second' where id = $1", [id]);
    expect(await publishDueArticles()).toBe(1);
    expect((await publishedArticle("scheduled-article"))?.title).toBe("Scheduled article");
  });
});

describe("academy", () => {
  async function course() {
    const c = await db.one<{ id: string }>(
      "insert into courses (slug, title, status, price_minor, certificate_enabled) values ('course-test','Course Test','published',0,true) on conflict (slug) do update set status='published' returning id");
    await db.query("delete from course_modules where course_id = $1", [c!.id]);
    const m = await db.one<{ id: string }>("insert into course_modules (course_id, title) values ($1,'M1') returning id", [c!.id]);
    const l1 = await db.one<{ id: string }>("insert into lessons (course_id, module_id, title, kind, position) values ($1,$2,'Intro','text',0) returning id", [c!.id, m!.id]);
    const l2 = await db.one<{ id: string }>("insert into lessons (course_id, module_id, title, kind, position) values ($1,$2,'Quiz','quiz',1) returning id", [c!.id, m!.id]);
    const l3 = await db.one<{ id: string }>("insert into lessons (course_id, module_id, title, kind, position, release_after_days) values ($1,$2,'Later','text',2,30) returning id", [c!.id, m!.id]);
    await db.query(`insert into quizzes (lesson_id, pass_percent, questions) values ($1, 100, $2)`, [l2!.id, JSON.stringify([{ id: "q1", prompt: "2+2?", options: [{ id: "a", label: "4", correct: true }, { id: "b", label: "5", correct: false }] }])]);
    return { courseId: c!.id, l1: l1!.id, l2: l2!.id, l3: l3!.id };
  }

  it("enrols, protects lessons, tracks progress, grades quizzes server-side and issues a verifiable certificate", async () => {
    const { l1, l2, l3 } = await course();
    const student = (await db.one<{ id: string }>("insert into users (email, email_verified_at, full_name) values ('student@example.com', now(), 'Stu Dent') returning id"))!.id;
    const outsider = (await db.one<{ id: string }>("insert into users (email, email_verified_at) values ('outsider@example.com', now()) returning id"))!.id;

    await expect(lessonForUser("course-test", l1, outsider)).rejects.toBeInstanceOf(AcademyError); // not enrolled
    await purchaseCatalogItem({ type: "course", slug: "course-test", buyer: { fullName: "Stu Dent", email: "student@example.com" } });
    await attachVerifiedUser(student);

    const lesson = await lessonForUser("course-test", l2, student);
    expect(JSON.stringify(lesson!.quiz)).not.toContain("correct"); // answers never leave the server
    await expect(lessonForUser("course-test", l3, student)).rejects.toThrow(/unlocks/); // drip

    await markLessonComplete(student, l1);
    await expect(markLessonComplete(student, l2)).rejects.toThrow(/Pass the quiz/);
    expect((await submitQuiz(student, l2, { q1: ["b"] })).passed).toBe(false);
    const passed = await submitQuiz(student, l2, { q1: ["a"] });
    expect(passed.passed).toBe(true);
    expect(passed.courseCompleted).toBe(false); // the dripped lesson isn't done yet

    await db.query("update lessons set release_after_days = null where id = $1", [l3]);
    const done = await markLessonComplete(student, l3);
    expect(done.courseCompleted).toBe(true);
    expect(done.certificateCode).toMatch(/^CERT-/);
    const cert = await verifyCertificate(done.certificateCode!);
    expect(cert?.recipient_name).toBe("Stu Dent");
    // Idempotent: completing again never issues a second certificate
    expect((await markLessonComplete(student, l1)).certificateCode).toBeNull();
    expect((await db.one<{ n: number }>("select count(*)::int as n from certificates"))!.n).toBe(1);
  });
});
