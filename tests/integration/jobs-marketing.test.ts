import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { db, closePool } from "@/lib/database/pool";
import { claimJobs, completeJob, enqueue, failJob, releaseStaleJobs, retryJob } from "@/lib/jobs/queue";
import { deliverEmail, enqueueEmail } from "@/features/notifications/application/send";
import { subscribe, confirmSubscription, unsubscribe } from "@/features/marketing/application/subscribers";
import { createContact, setStage, pipelineStages, mergeContacts, listContacts } from "@/features/crm/application/admin";
import { importContacts } from "@/features/crm/application/import";
import { rateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/security/passwords";
import { encrypt, decrypt, signValue, verifySignedValue } from "@/lib/security/crypto";
import { resetData } from "../helpers";

afterAll(() => closePool());
beforeEach(async () => {
  await resetData();
  rmSync(".data/test-mail", { recursive: true, force: true });
});

describe("durable job queue", () => {
  it("is idempotent, claims exclusively, retries with backoff and dead-letters", async () => {
    const id = await enqueue("test.job", { a: 1 }, { idempotencyKey: "k1", maxAttempts: 2 });
    expect(await enqueue("test.job", { a: 1 }, { idempotencyKey: "k1" })).toBeNull();
    const [a, b] = await Promise.all([claimJobs("w1", 5), claimJobs("w2", 5)]);
    expect(a.length + b.length).toBe(1);
    const job = [...a, ...b][0];
    expect(await failJob(job, new Error("boom"))).toBe("retry");
    const row = await db.one<{ status: string; run_at: Date; last_error: string }>("select * from jobs where id = $1", [id]);
    expect(row!.status).toBe("pending");
    expect(row!.run_at.getTime()).toBeGreaterThan(Date.now() + 20_000);
    await db.query("update jobs set run_at = now() where id = $1", [id]);
    const [again] = await claimJobs("w1", 1);
    expect(await failJob(again, new Error("boom2"))).toBe("dead");
    await retryJob(id!);
    const [third] = await claimJobs("w1", 1);
    await completeJob(third.id);
    expect((await db.one<{ status: string }>("select status from jobs where id = $1", [id]))!.status).toBe("completed");
  });

  it("recovers jobs abandoned by a crashed worker (restart recovery)", async () => {
    const id = await enqueue("test.job", {});
    await claimJobs("crashed", 1);
    await db.query("update jobs set locked_at = now() - interval '1 hour' where id = $1", [id]);
    expect(await releaseStaleJobs(600)).toBe(1);
    expect((await claimJobs("new", 1))).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("sends once per idempotency key and records provider acceptance (not delivery)", async () => {
    await enqueueEmail({ to: "a@example.com", template: "verify_email", data: { verifyUrl: "https://x.test/v" }, idempotencyKey: "n1" });
    await enqueueEmail({ to: "a@example.com", template: "verify_email", data: { verifyUrl: "https://x.test/v" }, idempotencyKey: "n1" });
    const jobs = await db.query<{ payload: { notificationId: string; data: Record<string, unknown> } }>("select payload from jobs where type = 'notification.email'");
    expect(jobs).toHaveLength(1);
    await deliverEmail(jobs[0].payload);
    await deliverEmail(jobs[0].payload);
    const n = await db.one<{ status: string; provider: string }>("select status, provider from notifications");
    expect(n).toMatchObject({ status: "accepted", provider: "dev-file" });
    const files = readdirSync(".data/test-mail");
    expect(files).toHaveLength(1);
    expect(readFileSync(`.data/test-mail/${files[0]}`, "utf8")).toContain("https://x.test/v");
  });

  it("suppresses marketing to unsubscribed addresses", async () => {
    await subscribe({ email: "sub@example.com", source: "test" });
    const confirmJob = await db.one<{ payload: { data: { confirmUrl: string } } }>("select payload from jobs where type = 'notification.email'");
    const token = new URL(confirmJob!.payload.data.confirmUrl).searchParams.get("token")!;
    expect(await confirmSubscription(token)).toBe(true);
    expect(await confirmSubscription(token)).toBe(false); // single use
    expect((await db.one<{ status: string }>("select status from subscribers"))!.status).toBe("subscribed");
    const sub = await db.one<{ unsubscribe_token: string }>("select unsubscribe_token from subscribers");
    expect(await unsubscribe(sub!.unsubscribe_token)).toBe(true);
    expect((await db.one<{ consent_marketing: boolean }>("select consent_marketing from contacts where email = 'sub@example.com'"))!.consent_marketing).toBe(false);
    const id = await enqueueEmail({ to: "sub@example.com", template: "campaign", data: { subject: "Hi", content: "x" }, idempotencyKey: "m1" });
    await deliverEmail({ notificationId: id, data: { subject: "Hi", content: "x" }, marketing: true });
    expect((await db.one<{ status: string }>("select status from notifications where id = $1", [id]))!.status).toBe("suppressed");
  });
});

describe("CRM", () => {
  it("creates leads, moves pipeline stages, merges duplicates and filters", async () => {
    const owner = await db.one<{ id: string }>("insert into users (email, role) values ('crm@example.com','owner') on conflict (email) do update set role = 'owner' returning id");
    const a = await createContact({ fullName: "Efua Mensah", email: "efua@example.com", phone: "+233 20 000 0000" }, owner!.id);
    const b = await createContact({ fullName: "Efua Mensah", email: "efua.m@work.example", phone: "+233200000000" }, owner!.id);
    await expect(createContact({ fullName: "X", email: "efua@example.com" }, owner!.id)).rejects.toThrow(/already exists/);
    const stages = await pipelineStages();
    await setStage(a, stages.find((s) => s.name === "Converted")!.id, owner!.id);
    expect((await db.one<{ lifecycle: string }>("select lifecycle from contacts where id = $1", [a]))!.lifecycle).toBe("customer");
    await mergeContacts(a, b, owner!.id);
    expect((await listContacts({ q: "Efua" })).total).toBe(1);
    expect((await listContacts({ lifecycle: "customer" })).total).toBe(1);
  });

  it("imports CSV with dedupe and never assumes consent", async () => {
    const owner = await db.one<{ id: string }>("insert into users (email, role) values ('imp@example.com','owner') on conflict (email) do update set role='owner' returning id");
    const csv = "Name,Email,Consent,Tags\nYaw,yaw@example.com,yes,vip\nBad,not-an-email,yes,\nYaw Again,YAW@example.com,yes,\n";
    const report = await importContacts(new File([csv], "list.csv"), { confirmConsent: false }, owner!.id);
    expect(report).toMatchObject({ created: 1, updated: 1 });
    expect(report.skipped).toHaveLength(1);
    expect((await db.one<{ consent_marketing: boolean }>("select consent_marketing from contacts where email = 'yaw@example.com'"))!.consent_marketing).toBe(false);
  });
});

describe("security primitives", () => {
  it("rate limits", async () => {
    await rateLimit("t:1", 2, 60);
    await rateLimit("t:1", 2, 60);
    await expect(rateLimit("t:1", 2, 60)).rejects.toBeInstanceOf(RateLimitError);
  });
  it("hashes passwords, encrypts secrets and signs expiring values", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(decrypt(encrypt("refresh-token"))).toBe("refresh-token");
    const t = signValue("x", Math.floor(Date.now() / 1000) + 60);
    expect(verifySignedValue(t)).toBe("x");
    expect(verifySignedValue(t.slice(0, -2) + "aa")).toBeNull();
    expect(verifySignedValue(signValue("x", Math.floor(Date.now() / 1000) - 1))).toBeNull();
  });
});
