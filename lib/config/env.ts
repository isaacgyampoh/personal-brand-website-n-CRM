import "server-only";
import { z } from "zod";

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
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional,
  SUPABASE_SECRET_KEY: optional,

  PAYSTACK_SECRET_KEY: optional,
  PAYSTACK_PUBLIC_KEY: optional,
  PAYMENTS_LIVE_APPROVED: bool,

  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_FROM: optional,
  MAIL_DEV_DIR: optional,

  MNOTIFY_API_KEY: optional,
  MNOTIFY_SENDER_ID: optional,

  STORAGE_DRIVER: z.enum(["r2", "local"]).default("local"),
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_PUBLIC_BUCKET: optional,
  R2_PRIVATE_BUCKET: optional,
  R2_PUBLIC_BASE_URL: optional,
  LOCAL_STORAGE_DIR: z.string().default(".data/storage"),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  ZOOM_ACCOUNT_ID: optional,
  ZOOM_CLIENT_ID: optional,
  ZOOM_CLIENT_SECRET: optional,

  AI_ENABLED: bool,
  ANTHROPIC_API_KEY: optional,
  AI_MODEL: z.string().default("claude-sonnet-5-5"),
  AI_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().min(0).default(300),

  ALLOW_LOCAL_STORAGE_IN_PRODUCTION: bool,
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
  if (e.NODE_ENV === "production") {
    if (e.STORAGE_DRIVER === "local" && !e.ALLOW_LOCAL_STORAGE_IN_PRODUCTION) {
      throw new Error("STORAGE_DRIVER=local is not allowed in production. Configure Cloudflare R2.");
    }
    if (e.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") && !e.PAYMENTS_LIVE_APPROVED) {
      throw new Error("Live Paystack key detected but PAYMENTS_LIVE_APPROVED is not true.");
    }
  }
  cached = e;
  return e;
}

/** Feature availability derived from configured credentials. Never fakes an integration. */
export function integrations() {
  const e = env();
  return {
    payments: Boolean(e.PAYSTACK_SECRET_KEY),
    paymentsLive: Boolean(e.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")),
    smtp: Boolean(e.SMTP_HOST && e.SMTP_FROM),
    sms: Boolean(e.MNOTIFY_API_KEY && e.MNOTIFY_SENDER_ID),
    r2: e.STORAGE_DRIVER === "r2" && Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY),
    googleCalendar: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    zoom: Boolean(e.ZOOM_ACCOUNT_ID && e.ZOOM_CLIENT_ID && e.ZOOM_CLIENT_SECRET),
    ai: e.AI_ENABLED && Boolean(e.ANTHROPIC_API_KEY),
    supabaseAuth: e.AUTH_PROVIDER === "supabase",
  };
}
