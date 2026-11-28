/**
 * Declarative description of every business integration the client can
 * configure in Studio → Settings → Integrations. Shared by the UI (form
 * rendering) and the server (validation, status). Contains no secrets.
 */
export type IntegrationProvider = "paystack" | "hubtel" | "google" | "zoom" | "smtp" | "r2" | "mnotify" | "ai";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "secret" | "url" | "email" | "number" | "select" | "multiselect" | "checkbox";
  required?: boolean;
  /** Stored separately for test and live modes (key prefixed with `test.` / `live.`). */
  perMode?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  default?: string | boolean | string[];
  pattern?: string;
};

export type IntegrationDef = {
  provider: IntegrationProvider;
  name: string;
  category: "Payments" | "Calendar & meetings" | "Communication" | "Storage" | "Content";
  summary: string;
  optional: boolean;
  modes: boolean;
  fields: FieldDef[];
  steps: string[];
  urls?: (appUrl: string) => { label: string; value: string }[];
  docs?: string;
  oauth?: boolean;
};

export const CURRENCIES = [
  { value: "GHS", label: "GHS — Ghana cedi" }, { value: "NGN", label: "NGN — Naira" }, { value: "USD", label: "USD — US dollar" },
  { value: "KES", label: "KES — Kenyan shilling" }, { value: "ZAR", label: "ZAR — Rand" },
];

export const INTEGRATIONS: IntegrationDef[] = [
  {
    provider: "paystack", name: "Paystack", category: "Payments", optional: false, modes: true,
    summary: "Primary payment provider — Mobile Money and cards for bookings, masterclasses, courses and products.",
    fields: [
      { name: "publicKey", label: "Public key", type: "text", perMode: true, required: true, placeholder: "pk_test_…", pattern: "^pk_(test|live)_[A-Za-z0-9]+$" },
      { name: "secretKey", label: "Secret key", type: "secret", perMode: true, required: true, placeholder: "sk_test_…", pattern: "^sk_(test|live)_[A-Za-z0-9]+$", help: "Also used to verify webhook signatures. Never shown again after saving." },
      { name: "currency", label: "Currency", type: "select", options: CURRENCIES, default: "GHS", required: true, help: "Must be enabled on your Paystack account." },
      { name: "channels", label: "Payment channels", type: "multiselect", default: ["mobile_money", "card"], options: [
        { value: "mobile_money", label: "Mobile Money" }, { value: "card", label: "Card" }, { value: "bank", label: "Bank" },
        { value: "bank_transfer", label: "Bank transfer" }, { value: "ussd", label: "USSD" }, { value: "qr", label: "QR" }, { value: "apple_pay", label: "Apple Pay" },
      ] },
    ],
    steps: [
      "Open https://dashboard.paystack.com/#/settings/developers in a new tab and sign in to Paystack.",
      "On that page you see two keys under “Test”. Copy the one starting pk_test_ into “Public key (test)” below, and the one starting sk_test_ into “Secret key (test)”. Press Save.",
      "Still on that Paystack page, paste the Webhook URL shown below into “Test Webhook URL”, and the Callback URL into “Test Callback URL”. Press Save changes on Paystack.",
      "Back here, press Test connection. When the badge says Connected, press Enable. No real money moves in test mode.",
      "Going live happens together with your technical administrator after one test payment and refund have worked.",
    ],
    urls: (u) => [{ label: "Webhook URL", value: `${u}/api/webhooks/paystack` }, { label: "Callback URL", value: `${u}/checkout/complete` }],
    docs: "https://paystack.com/docs/payments/webhooks/",
  },
  {
    provider: "hubtel", name: "Hubtel", category: "Payments", optional: true, modes: false,
    summary: "Optional alternative checkout for Ghana (Mobile Money and cards) via Hubtel Online Checkout.",
    fields: [
      { name: "apiId", label: "API ID (username)", type: "text", required: true },
      { name: "apiKey", label: "API key (password)", type: "secret", required: true },
      { name: "merchantAccountNumber", label: "Merchant account number (POS Sales ID)", type: "text", required: true, pattern: "^[0-9]{3,20}$" },
      { name: "initiateUrl", label: "Checkout initiate endpoint", type: "url", default: "https://payproxyapi.hubtel.com/items/initiate", required: true, help: "Only change if Hubtel gives you a different endpoint." },
      { name: "statusUrl", label: "Status check endpoint", type: "url", default: "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status", required: true, help: "Hubtel requires this server's public IP address to be whitelisted for status checks." },
    ],
    steps: [
      "From your Hubtel merchant dashboard, request API access for Online Checkout and obtain your API ID, API key and POS Sales ID (merchant account number).",
      "Ask Hubtel to whitelist this server's public IP address for the Transaction Status Check API — payments are only confirmed after a successful status check.",
      "Enter the credentials, save, then Test connection.",
      "Choose Hubtel as the active provider in Business settings only after a successful small real payment and refund test (Hubtel has no public test mode).",
    ],
    urls: (u) => [{ label: "Callback URL (set automatically per payment)", value: `${u}/api/webhooks/hubtel` }],
  },
  {
    provider: "google", name: "Google Calendar & Meet", category: "Calendar & meetings", optional: true, modes: false, oauth: true,
    summary: "Sync bookings to your calendar, block busy times, send invitations and create Google Meet links.",
    fields: [
      { name: "clientId", label: "OAuth client ID", type: "text", required: true, placeholder: "….apps.googleusercontent.com" },
      { name: "clientSecret", label: "OAuth client secret", type: "secret", required: true },
      { name: "calendarId", label: "Calendar", type: "text", default: "primary", help: "Choose after connecting." },
      { name: "syncBusy", label: "Block times that are busy in this calendar", type: "checkbox", default: true },
      { name: "sendInvites", label: "Send Google Calendar invitations to clients", type: "checkbox", default: true },
    ],
    steps: [
      "In Google Cloud Console create a project, enable the Google Calendar API, and configure the OAuth consent screen (External; add yourself as a test user until verified).",
      "Create an OAuth client ID of type Web application and add the Redirect URI shown here.",
      "Paste the client ID and secret, save, then click Connect Google account and approve access.",
      "Pick the calendar to use and click Test connection.",
    ],
    urls: (u) => [{ label: "Authorised redirect URI", value: `${u}/api/integrations/google/callback` }],
  },
  {
    provider: "zoom", name: "Zoom", category: "Calendar & meetings", optional: true, modes: false,
    summary: "Create, update and cancel Zoom meetings automatically for sessions and masterclasses.",
    fields: [
      { name: "accountId", label: "Account ID", type: "text", required: true },
      { name: "clientId", label: "Client ID", type: "text", required: true },
      { name: "clientSecret", label: "Client secret", type: "secret", required: true },
      { name: "hostUser", label: "Host user (email or 'me')", type: "text", default: "me" },
      { name: "waitingRoom", label: "Enable waiting room", type: "checkbox", default: true },
    ],
    steps: [
      "Go to marketplace.zoom.us → Develop → Build App → Server-to-Server OAuth.",
      "Add scopes: meeting:write:meeting:admin (or meeting:write:admin), meeting:update:meeting:admin, meeting:delete:meeting:admin, user:read:user:admin.",
      "Activate the app, copy the Account ID, Client ID and Client secret here, save and Test connection.",
    ],
  },
  {
    provider: "smtp", name: "Email", category: "Communication", optional: false, modes: false,
    summary: "Sends booking and registration confirmations, receipts, reminders and password resets from your own email address (Gmail works).",
    fields: [
      { name: "host", label: "SMTP server", type: "text", required: true, placeholder: "smtp.yourprovider.com" },
      { name: "port", label: "Port", type: "number", default: "587", required: true },
      { name: "security", label: "Encryption", type: "select", default: "starttls", options: [
        { value: "starttls", label: "STARTTLS (usually port 587)" }, { value: "tls", label: "SSL/TLS (usually port 465)" },
      ] },
      { name: "username", label: "Username", type: "text", required: true },
      { name: "password", label: "Password / app password", type: "secret", required: true },
      { name: "fromEmail", label: "Sender email", type: "email", required: true },
      { name: "fromName", label: "Sender name", type: "text" },
      { name: "replyTo", label: "Reply-to address", type: "email" },
    ],
    steps: [
      "For Gmail, use the Connect Gmail section above instead — it fills in everything for you.",
      "For another provider, enter the SMTP server, port, username and password (or app password) it gives you.",
      "If you send from your own domain, make sure it has SPF and DKIM records (your provider shows them).",
      "Save, Test connection, then send yourself a test email.",
    ],
  },
  {
    provider: "r2", name: "Cloudflare R2 storage", category: "Storage", optional: false, modes: false,
    summary: "Stores photographs, flyers, downloads and recordings outside the database.",
    fields: [
      { name: "accountId", label: "Cloudflare account ID", type: "text", required: true, pattern: "^[a-f0-9]{32}$" },
      { name: "accessKeyId", label: "Access key ID", type: "text", required: true },
      { name: "secretAccessKey", label: "Secret access key", type: "secret", required: true },
      { name: "publicBucket", label: "Public bucket (website images)", type: "text", required: true },
      { name: "privateBucket", label: "Private bucket (paid files)", type: "text", required: true },
      { name: "publicBaseUrl", label: "Public bucket URL", type: "url", required: true, placeholder: "https://media.yourdomain.com", help: "The custom domain (or r2.dev URL) connected to the public bucket." },
    ],
    steps: [
      "In Cloudflare → R2 create two buckets, e.g. brand-public and brand-private. Do not make the private bucket public.",
      "Connect a custom domain (e.g. media.yourdomain.com) to the public bucket.",
      "Create an R2 API token with Object Read & Write limited to these two buckets.",
      "Enter the values, save and Test connection (it writes, reads and deletes a small test file in each bucket).",
    ],
  },
  {
    provider: "mnotify", name: "mNotify SMS", category: "Communication", optional: true, modes: false,
    summary: "Optional SMS reminders for appointments and classes.",
    fields: [
      { name: "apiKey", label: "API key", type: "secret", required: true },
      { name: "senderId", label: "Sender ID", type: "text", required: true, help: "Must be approved by mNotify (max 11 characters).", pattern: "^[A-Za-z0-9 ]{1,11}$" },
    ],
    steps: ["Create an mNotify account, register and get approval for a sender ID, copy your API key, save and Test connection."],
  },
  {
    provider: "ai", name: "AI content assistant", category: "Content", optional: true, modes: false,
    summary: "Optional drafting help for posts, emails and descriptions. Drafts are never published automatically.",
    fields: [
      { name: "apiKey", label: "Anthropic API key", type: "secret", required: true, placeholder: "sk-ant-…" },
      { name: "model", label: "Model", type: "text", default: "claude-opus-5-5" },
      { name: "monthlyLimit", label: "Monthly request limit", type: "number", default: "300" },
    ],
    steps: ["Create an API key at console.anthropic.com, set a spending limit there, paste the key here, save and Test connection."],
  },
];

export const integrationDef = (p: IntegrationProvider) => INTEGRATIONS.find((d) => d.provider === p)!;

export type IntegrationStatus = "not_configured" | "incomplete" | "verification_required" | "connected" | "failed" | "disabled";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  not_configured: "Not configured", incomplete: "Configuration incomplete", verification_required: "Verification required",
  connected: "Connected", failed: "Connection failed", disabled: "Disabled",
};

/** Field key as stored, honouring per-mode fields. */
export const storedKey = (f: FieldDef, mode: "test" | "live") => (f.perMode ? `${mode}.${f.name}` : f.name);

/**
 * Pure status rule. "Connected" requires that the CURRENT configuration hash
 * passed a connection test; any credential change drops back to
 * "verification required".
 */
export function computeStatus(input: {
  def: IntegrationDef; mode: "test" | "live"; enabled: boolean; present: Set<string>; hasAny: boolean;
  currentHash: string; verifiedHash: string | null; lastFailureAt: Date | null; lastSuccessAt: Date | null;
}): IntegrationStatus {
  if (!input.hasAny) return "not_configured";
  const missing = input.def.fields.filter((f) => f.required && !input.present.has(storedKey(f, input.mode)));
  if (missing.length) return "incomplete";
  if (!input.enabled) return "disabled";
  if (input.verifiedHash === input.currentHash) {
    if (input.lastFailureAt && input.lastSuccessAt && input.lastFailureAt > input.lastSuccessAt) return "failed";
    return "connected";
  }
  if (input.lastFailureAt && (!input.lastSuccessAt || input.lastFailureAt > input.lastSuccessAt)) return "failed";
  return "verification_required";
}
