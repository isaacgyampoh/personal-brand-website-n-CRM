import { describe, expect, it, beforeEach } from "vitest";
import { maskSecret, openSecret, parseKeyring, resetVaultForTests, sealSecret } from "@/lib/security/vault";
import { base32Encode, totpAt, verifyTotp, currentStep, generateRecoveryCodes } from "@/lib/security/totp";
import { isPrivateAddress } from "@/lib/security/network";
import { computeStatus, integrationDef, storedKey } from "@/lib/integrations/definitions";
import { createHubtelGateway } from "@/features/payments/infrastructure/hubtel";

describe("credential vault (AES-256-GCM, versioned keys)", () => {
  beforeEach(() => resetVaultForTests());

  it("round-trips, uses unique nonces and never contains the plaintext", () => {
    const a = sealSecret("sk_test_abcdef123456", "integration:paystack");
    const b = sealSecret("sk_test_abcdef123456", "integration:paystack");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ciphertext).not.toContain("abcdef");
    expect(a.keyVersion).toBe(2);
    expect(openSecret(a.ciphertext, "integration:paystack")).toBe("sk_test_abcdef123456");
  });

  it("rejects tampering and use under a different context (AAD)", () => {
    const { ciphertext } = sealSecret("secret-value", "integration:smtp");
    expect(() => openSecret(ciphertext, "integration:paystack")).toThrow();
    const parts = ciphertext.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 1;
    parts[3] = ct.toString("base64url");
    expect(() => openSecret(parts.join("."), "integration:smtp")).toThrow();
  });

  it("decrypts values sealed with an older key version after rotation", () => {
    const old = process.env.CREDENTIALS_MASTER_KEYS!;
    const v1Only = old.split(",").find((p) => p.startsWith("1:"))!;
    process.env.CREDENTIALS_MASTER_KEYS = v1Only;
    resetVaultForTests();
    const sealed = sealSecret("rotate-me", "integration:r2");
    expect(sealed.keyVersion).toBe(1);
    process.env.CREDENTIALS_MASTER_KEYS = old;
    resetVaultForTests();
    expect(openSecret(sealed.ciphertext, "integration:r2")).toBe("rotate-me");
  });

  it("refuses weak or malformed keyrings", () => {
    expect(() => parseKeyring("1:" + Buffer.alloc(16).toString("base64"))).toThrow();
    expect(() => parseKeyring("x:abc")).toThrow();
    expect(parseKeyring(undefined)).toBeNull();
  });

  it("masks secrets for display, keeping only mode prefix and last 4", () => {
    expect(maskSecret("sk_live_1234567890abcd")).toBe("sk_live_••••abcd");
    expect(maskSecret("short")).not.toContain("short");
  });
});

describe("TOTP (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 SHA-1 test vectors (6-digit truncation)", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(secret, Math.floor(2000000000 / 30))).toBe("279037");
  });
  it("accepts ±1 step drift, rejects replays and garbage", () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), { now })).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step - 3), { now })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), { now, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, "12345a", { now })).toBeNull();
  });
  it("creates 10 distinct recovery codes", () => {
    const c = generateRecoveryCodes();
    expect(new Set(c).size).toBe(10);
    expect(c.every((x) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(x))).toBe(true);
  });
});

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])("%s is private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "104.16.1.1", "2606:4700::1111"])("%s is public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("integration status rules", () => {
  const def = integrationDef("paystack");
  const all = new Set(def.fields.filter((f) => f.required).map((f) => storedKey(f, "test")));
  const base = { def, mode: "test" as const, enabled: true, present: all, hasAny: true, currentHash: "h1", verifiedHash: null, lastFailureAt: null, lastSuccessAt: null };
  it("is never 'connected' without a passing test of the current configuration", () => {
    expect(computeStatus(base)).toBe("verification_required");
    expect(computeStatus({ ...base, verifiedHash: "old-hash", lastSuccessAt: new Date() })).toBe("verification_required");
    expect(computeStatus({ ...base, verifiedHash: "h1", lastSuccessAt: new Date() })).toBe("connected");
  });
  it("reports not configured / incomplete / disabled / failed", () => {
    expect(computeStatus({ ...base, hasAny: false })).toBe("not_configured");
    expect(computeStatus({ ...base, present: new Set() })).toBe("incomplete");
    expect(computeStatus({ ...base, enabled: false })).toBe("disabled");
    expect(computeStatus({ ...base, lastFailureAt: new Date() })).toBe("failed");
  });
});

describe("Hubtel adapter (request shape & status mapping, offline)", () => {
  const cfg = { apiId: "id", apiKey: "key", merchantAccountNumber: "2020", initiateUrl: "https://payproxy.example/items/initiate", statusUrl: "https://status.example/transactions/{merchantAccountNumber}/status" };
  it("sends decimal cedis with Basic auth and returns the checkout URL", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const gw = createHubtelGateway(cfg, (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ responseCode: "0000", data: { checkoutUrl: "https://pay.hubtel.com/abc", checkoutId: "abc" } }), { status: 200 });
    }) as unknown as typeof fetch);
    const r = await gw.initialize({ reference: "ORD-1-P1", amountMinor: 12550, currency: "GHS", email: "a@b.co", callbackUrl: "https://x/cb", returnUrl: "https://x/r", cancelUrl: "https://x/c", description: "Masterclass", metadata: {} });
    expect(r.authorizationUrl).toBe("https://pay.hubtel.com/abc");
    const body = JSON.parse(String(seen!.init.body));
    expect(body).toMatchObject({ totalAmount: 125.5, clientReference: "ORD-1-P1", merchantAccountNumber: "2020", cancellationUrl: "https://x/c" });
    expect((seen!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("id:key").toString("base64")}`);
    await expect(gw.initialize({ reference: "R", amountMinor: 1, currency: "USD", email: "", callbackUrl: "", returnUrl: "", cancelUrl: "", description: "", metadata: {} })).rejects.toThrow(/GHS/);
  });
  it("maps status-check results and converts amounts to minor units", async () => {
    const gw = createHubtelGateway(cfg, (async (url: string) => {
      expect(url).toBe("https://status.example/transactions/2020/status?clientReference=ORD-1-P1");
      return new Response(JSON.stringify({ message: "Successful", data: { status: "Paid", amount: 125.5, clientReference: "ORD-1-P1", transactionId: "t1", currencyCode: "GHS" } }));
    }) as unknown as typeof fetch);
    const v = await gw.verify("ORD-1-P1");
    expect(v).toMatchObject({ status: "success", amountMinor: 12550, currency: "GHS", reference: "ORD-1-P1" });
    expect(gw.verifyWebhookSignature("{}", "anything")).toBe(false);
    expect(gw.supportsRefunds).toBe(false);
  });
  it("explains IP-whitelisting failures", async () => {
    const gw = createHubtelGateway(cfg, (async () => new Response("Forbidden", { status: 403 })) as unknown as typeof fetch);
    await expect(gw.testConnection()).rejects.toThrow(/whitelist/);
  });
});

describe("password policy", () => {
  it("refuses short, common and all-digit passwords but accepts passphrases", async () => {
    const { passwordProblems } = await import("@/lib/security/passwords");
    expect(passwordProblems("short")).not.toEqual([]);
    expect(passwordProblems("Password123!")).not.toEqual([]);
    expect(passwordProblems("12345678901")).not.toEqual([]);
    expect(passwordProblems("ama.mensah2026", "ama.mensah@example.com")).not.toEqual([]);
    expect(passwordProblems("REDACTED-LOCAL-TEST-PASSWORD")).toEqual([]);
  });
});
