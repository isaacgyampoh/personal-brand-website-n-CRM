import "server-only";
import { z } from "zod";

/**
 * Infrastructure-level configuration only. Business integrations (Paystack,
 * Hubtel, SMTP, R2, Google, Zoom, mNotify, AI) are configured by the client in
 * Studio → Settings → Integrations and stored encrypted in the database —
 * see lib/integrations/.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool,
  DATABASE_SSL_ALLOW_SELF_SIGNED: bool,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  /**
   * Master keys that encrypt integration credentials, as `version:base64key`
   * pairs separated by commas, e.g. `2:BASE64,1:BASE64`. The first entry is
   * used for new encryptions; older versions remain for decryption until
   * rotated. Each key is 32 random bytes (openssl rand -base64 32).
   */
  CREDENTIALS_MASTER_KEYS: optional,

  /** Live payment credentials can only be activated when the operator sets this. */
  PAYMENTS_LIVE_APPROVED: bool,

  /** Local disk storage is for development; staging may opt in until R2 is configured. */
  ALLOW_LOCAL_STORAGE_IN_PRODUCTION: bool,
  LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
  MAIL_DEV_DIR: optional,

  /** Comma-separated hostnames allowed to resolve to private IPs (e.g. an SMTP relay on the private network). */
  ALLOWED_PRIVATE_HOSTS: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && !e.CREDENTIALS_MASTER_KEYS) {
    console.warn("[config] CREDENTIALS_MASTER_KEYS is not set — integrations cannot be configured until it is.");
  }
  cached = e;
  return e;
}
