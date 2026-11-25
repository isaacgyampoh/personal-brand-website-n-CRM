import { TEST_DATABASE_URL } from "./env";
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  APP_SECRET: "test-secret-test-secret-test-secret-0123456789",
  APP_URL: "http://localhost:3000",
  AUTH_PROVIDER: "local",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: ".data/test-storage",
  MAIL_DEV_DIR: ".data/test-mail",
  DATABASE_POOL_MAX: "10",
});
