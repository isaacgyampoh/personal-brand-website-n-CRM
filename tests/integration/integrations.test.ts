import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closePool } from "@/lib/database/pool";
import { encrypt, hashToken, signValue } from "@/lib/security/crypto";
import { base32Encode, currentStep, totpAt } from "@/lib/security/totp";
import { checkSecondFactor } from "@/lib/auth/mfa";
import {
  getIntegration, invalidateIntegrationCache, listIntegrationViews, recordTestResult, rotateCredentialEncryption, saveIntegration, setIntegrationEnabled,
} from "@/lib/integrations/store";
import { resetVaultForTests } from "@/lib/security/vault";
import { paymentsReady, setPaymentGatewayForTests } from "@/features/payments/application/gateway";
import { receiveHubtelCallback } from "@/features/payments/application/webhooks";
import { verifyAndApply } from "@/features/commerce/application/fulfilment";
import { confirmManualRefund, requestRefund, submitRefund } from "@/features/commerce/application/refunds";
import { fakeGateway, makeEvent, resetData } from "../helpers";
import { registerForEvent } from "@/features/events/application/registration";

afterAll(() => closePool());

let actor: string;
beforeEach(async () => {
  await resetData();
  await db.query("delete from integration_configs");
  invalidateIntegrationCache();
  setPaymentGatewayForTests(undefined);
  actor = (await db.one<{ id: string }>(
    "insert into users (email, role) values ('owner-int@example.com','owner') on conflict (email) do update set role = 'owner' returning id",
  ))!.id;
});

const PAYSTACK = { "test.publicKey": "pk_test_abc123", "test.secretKey": "sk_test_supersecretvalue9876", currency: "GHS" };

describe("Integration Centre store", () => {
  it("stores secrets encrypted and only ever exposes masked hints", async () => {
    await saveIntegration("paystack", { values: PAYSTACK }, actor);
    const row = await db.one<{ settings: Record<string, string>; secrets_encrypted: string; key_version: number }>("select settings, secrets_encrypted, key_version from integration_configs where provider = 'paystack'");
    expect(JSON.stringify(row)).not.toContain("supersecretvalue");
    expect(row!.settings["test.publicKey"]).toBe("pk_test_abc123");
    expect(row!.key_version).toBe(2);
    const view = (await listIntegrationViews()).find((v) => v.provider === "paystack")!;
    expect(JSON.stringify(view)).not.toContain("supersecretvalue");
    expect(view.secretHints["test.secretKey"]).toBe("sk_test_••••9876");
    // Server-side resolution decrypts for adapters.
    expect((await getIntegration("paystack")).values.secretKey).toBe("sk_test_supersecretvalue9876");
    // Audit records changed field names, never values.
    const audit = await db.one<{ data: { changedFields: string[] } }>("select data from audit_logs where action = 'integration.configure' order by id desc limit 1");
    expect(audit!.data.changedFields).toContain("test.secretKey");
    expect(JSON.stringify(audit)).not.toContain("supersecret");
  });

  it("blank secret keeps the stored value; mismatched mode keys are rejected", async () => {
    await saveIntegration("paystack", { values: PAYSTACK }, actor);
    await saveIntegration("paystack", { values: { "test.secretKey": "", currency: "GHS" } }, actor);
    expect((await getIntegration("paystack")).values.secretKey).toBe("sk_test_supersecretvalue9876");
    await expect(saveIntegration("paystack", { values: { "test.secretKey": "sk_live_wrongmode1234" } }, actor)).rejects.toThrow(/test key/);
  });

  it("shows Connected only after a passing test of the CURRENT configuration", async () => {
    await saveIntegration("paystack", { values: PAYSTACK }, actor);
    await setIntegrationEnabled("paystack", true, actor);
    expect((await getIntegration("paystack")).status).toBe("verification_required");
    await recordTestResult("paystack", true, null, actor);
    expect((await getIntegration("paystack")).status).toBe("connected");
    await saveIntegration("paystack", { values: { "test.secretKey": "sk_test_rotatedvalue0001" } }, actor);
    expect((await getIntegration("paystack")).status).toBe("verification_required");
    await recordTestResult("paystack", false, "401 Invalid key", actor);
    expect((await getIntegration("paystack")).status).toBe("failed");
  });

  it("checkout needs an enabled + verified provider; live mode and Hubtel stay locked without operator approval", async () => {
    expect(await paymentsReady()).toBe(false);
    await saveIntegration("paystack", { values: PAYSTACK }, actor);
    await setIntegrationEnabled("paystack", true, actor);
    expect(await paymentsReady()).toBe(false); // configured but not verified
    await recordTestResult("paystack", true, null, actor);
    expect(await paymentsReady()).toBe(true);
    await expect(saveIntegration("paystack", { values: {}, mode: "live" }, actor)).rejects.toThrow(/locked/);
    await saveIntegration("hubtel", { values: { apiId: "id", apiKey: "secretkey123", merchantAccountNumber: "2020" } }, actor);
    await expect(setIntegrationEnabled("hubtel", true, actor)).rejects.toThrow(/locked/);
  });

  it("rejects configurable URLs that point at private networks (SSRF)", async () => {
    await expect(saveIntegration("hubtel", { values: { initiateUrl: "https://127.0.0.1/items/initiate" } }, actor)).rejects.toThrow(/private|reserved/);
    await expect(saveIntegration("hubtel", { values: { initiateUrl: "http://payproxyapi.hubtel.com/items/initiate" } }, actor)).rejects.toThrow(/https/);
  });

  it("rotates stored credentials to a new master key version without data loss", async () => {
    await saveIntegration("paystack", { values: PAYSTACK }, actor);
    const original = process.env.CREDENTIALS_MASTER_KEYS!;
    process.env.CREDENTIALS_MASTER_KEYS = `3:${Buffer.alloc(32, 7).toString("base64")},${original}`;
    resetVaultForTests();
    try {
      expect(await rotateCredentialEncryption(actor)).toBe(1);
      expect((await db.one<{ key_version: number }>("select key_version from integration_configs where provider = 'paystack'"))!.key_version).toBe(3);
      expect((await getIntegration("paystack")).values.secretKey).toBe("sk_test_supersecretvalue9876");
      expect(await rotateCredentialEncryption(actor)).toBe(0);
    } finally {
      process.env.CREDENTIALS_MASTER_KEYS = original;
      resetVaultForTests();
      await db.query("delete from integration_configs");
      invalidateIntegrationCache();
    }
  });

  it("an optional integration missing doesn't break anything", async () => {
    expect((await getIntegration("zoom")).status).toBe("not_configured");
    expect((await getIntegration("ai")).usable).toBe(false);
  });
});

describe("provider isolation & Hubtel callbacks", () => {
  async function pendingPayment(provider: "paystack" | "hubtel") {
    const fake = fakeGateway();
    setPaymentGatewayForTests(fake.gw);
    const e = await makeEvent({ capacity: 5, price: 10000 });
    await registerForEvent({ eventSlug: e.slug, ticketTypeId: e.ticketId, buyer: { fullName: "Kofi", email: "kofi@example.com" }, attendees: [{ fullName: "Kofi", email: "kofi@example.com" }] });
    const p = await db.one<{ id: string; provider_reference: string; order_id: string }>("select id, provider_reference, order_id from payments order by created_at desc limit 1");
    if (provider === "hubtel") await db.query("update payments set provider = 'hubtel' where id = $1", [p!.id]);
    return { fake, ref: p!.provider_reference, orderId: p!.order_id };
  }

  it("never verifies a payment with a different provider than the one that created it", async () => {
    const { fake, ref, orderId } = await pendingPayment("hubtel");
    fake.succeed(ref);
    // The injected gateway is "paystack": a Hubtel payment must not be settled through it.
    expect((await verifyAndApply(ref)).status).toBe("unconfigured");
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("pending");
  });

  it("Hubtel callbacks require our signed token bound to the payment reference", async () => {
    setPaymentGatewayForTests(undefined);
    await saveIntegration("hubtel", { values: { apiId: "id", apiKey: "secretkey123", merchantAccountNumber: "2020" } }, actor);
    const body = (ref: string) => JSON.stringify({ ResponseCode: "0000", Status: "Success", Data: { CheckoutId: "c1", ClientReference: ref, Status: "Success", Amount: 100 } });
    expect((await receiveHubtelCallback(body("ORD-AAAAAAAAAA-P1"), null)).status).toBe(401);
    expect((await receiveHubtelCallback(body("ORD-AAAAAAAAAA-P1"), "forged.token")).status).toBe(401);
    const tokenForOther = signValue("pay:ORD-BBBBBBBBBB-P1", Math.floor(Date.now() / 1000) + 600);
    expect((await receiveHubtelCallback(body("ORD-AAAAAAAAAA-P1"), tokenForOther)).status).toBe(401);
    const good = signValue("pay:ORD-AAAAAAAAAA-P1", Math.floor(Date.now() / 1000) + 600);
    expect((await receiveHubtelCallback(body("ORD-AAAAAAAAAA-P1"), good)).status).toBe(200);
    // Stored once; a duplicate callback is acknowledged but not re-queued.
    expect((await receiveHubtelCallback(body("ORD-AAAAAAAAAA-P1"), good)).status).toBe(200);
    expect((await db.one<{ n: number }>("select count(*)::int as n from payment_events where provider = 'hubtel'"))!.n).toBe(1);
    expect((await db.one<{ n: number }>("select count(*)::int as n from jobs where type = 'payment.webhook'"))!.n).toBe(1);
  });

  it("refunds on a provider without a refund API wait for staff confirmation", async () => {
    const { fake, ref, orderId } = await pendingPayment("paystack");
    fake.succeed(ref);
    expect((await verifyAndApply(ref)).status).toBe("paid");
    await db.query("update payments set provider = 'hubtel' where provider_reference = $1", [ref]);
    const hubtelLike = { ...fake.gw, name: "hubtel" as const, supportsRefunds: false };
    setPaymentGatewayForTests(hubtelLike);
    const refundId = await requestRefund({ orderId, amountMinor: 10000, reason: "test", actorId: actor });
    await submitRefund(refundId!);
    expect((await db.one<{ status: string }>("select status from refunds where id = $1", [refundId]))!.status).toBe("processing");
    expect(fake.refunds.length).toBe(0);
    expect((await db.one<{ n: number }>("select count(*)::int as n from tasks where title like 'Manual refund needed%'"))!.n).toBe(1);
    await confirmManualRefund(refundId!, actor, "Refunded in Hubtel dashboard");
    expect((await db.one<{ status: string }>("select status from orders where id = $1", [orderId]))!.status).toBe("refunded");
  });
});

describe("staff MFA second factor", () => {
  it("accepts a current TOTP once, rejects replay, and consumes recovery codes", async () => {
    const secret = base32Encode(Buffer.from("integration-test-secret-20b"));
    await db.query(
      "update users set mfa_secret_encrypted = $2, mfa_enabled_at = now(), mfa_recovery_codes = $3, mfa_last_step = null where id = $1",
      [actor, encrypt(secret), JSON.stringify([hashToken("recovery:abcde-12345")])],
    );
    const code = totpAt(secret, currentStep());
    expect(await checkSecondFactor(actor, code)).toBe(true);
    expect(await checkSecondFactor(actor, code)).toBe(false); // replay
    expect(await checkSecondFactor(actor, "000000")).toBe(false);
    expect(await checkSecondFactor(actor, "abcde-12345")).toBe(true);
    expect(await checkSecondFactor(actor, "abcde-12345")).toBe(false); // single use
  });
});
