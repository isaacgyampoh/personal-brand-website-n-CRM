import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a running dev/staging server (default http://localhost:3000)
 * seeded with demo content. Set E2E_BASE_URL to target staging.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Against an MFA-enforcing deployment each staff sign-in may wait for a fresh 30 s TOTP window.
  timeout: process.env.E2E_MFA_ENFORCED === "1" ? 180_000 : 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "pnpm dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
