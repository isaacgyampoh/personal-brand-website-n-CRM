import { TEST_DATABASE_URL } from "./env";
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  APP_SECRET: "test-secret-test-secret-test-secret-0123456789",
  APP_URL: "http://localhost:3000",
  // Fixed, test-only master key (never used outside the test database).
  CREDENTIALS_MASTER_KEYS: "2:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=,1:Hx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA=",
  STAFF_MFA_REQUIRED: "false",
  LOCAL_STORAGE_DIR: ".data/test-storage",
  MAIL_DEV_DIR: ".data/test-mail",
  DATABASE_POOL_MAX: "10",
});
