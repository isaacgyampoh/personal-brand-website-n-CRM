import { requireStaffPage } from "@/lib/auth/session";
import { env, integrations } from "@/lib/config/env";
import { db } from "@/lib/database/pool";
import { disconnectIntegrationAction } from "@/features/settings/presentation/actions";
import { PageTitle, Panel, StatusBadge, Notice, LinkButton } from "@/components/dashboard/ui";
import { ActionButton } from "@/components/dashboard/forms";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  await requireStaffPage("settings:manage");
  const sp = await searchParams;
  const i = integrations();
  const e = env();
  const gcal = await db.one<{ status: string }>("select status from integrations where provider = 'google_calendar'");
  const rows: { name: string; ok: boolean; detail: string; verified: string; action?: React.ReactNode }[] = [
    { name: "Database (PostgreSQL)", ok: true, detail: "Connected", verified: "Tested" },
    { name: "Authentication", ok: true, detail: e.AUTH_PROVIDER === "supabase" ? "Supabase Auth" : "Built-in (local) auth", verified: e.AUTH_PROVIDER === "supabase" ? "Not yet verified against a live Supabase project" : "Tested" },
    { name: "Paystack payments", ok: i.payments, detail: i.payments ? (i.paymentsLive ? "LIVE mode" : "Test mode") : "Set PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY", verified: "Adapter unit-tested; live API calls not yet verified" },
    { name: "Email (SMTP)", ok: i.smtp, detail: i.smtp ? `${e.SMTP_HOST} as ${e.SMTP_FROM}` : "Set SMTP_HOST, SMTP_FROM (and credentials)", verified: i.smtp ? "Send a test from Email templates" : "Development mode writes emails to disk" },
    { name: "Cloudflare R2 storage", ok: i.r2, detail: i.r2 ? `${e.R2_PUBLIC_BUCKET} / ${e.R2_PRIVATE_BUCKET}` : "Using local development storage", verified: "Not yet verified" },
    { name: "mNotify SMS (optional)", ok: i.sms, detail: i.sms ? `Sender ${e.MNOTIFY_SENDER_ID}` : "Not configured", verified: "Not yet verified" },
    { name: "Google Calendar sync (optional)", ok: gcal?.status === "connected", detail: !i.googleCalendar ? "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : gcal?.status === "connected" ? "Connected — confirmed bookings appear in your calendar" : "Ready to connect", verified: "Not yet verified",
      action: i.googleCalendar ? (gcal?.status === "connected" ? <ActionButton action={disconnectIntegrationAction} fields={{ provider: "google_calendar" }} label="Disconnect" /> : <LinkButton href="/api/integrations/google/connect" size="sm">Connect Google Calendar</LinkButton>) : undefined },
    { name: "Zoom (optional)", ok: i.zoom, detail: i.zoom ? "Credentials present" : "Paste Zoom links per event/service (no API needed)", verified: "Automatic meeting creation not implemented; manual links supported" },
    { name: "AI assistant (optional)", ok: i.ai, detail: i.ai ? `Model ${e.AI_MODEL}` : "Disabled — set AI_ENABLED=true and ANTHROPIC_API_KEY", verified: "Not yet verified" },
  ];
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Integrations" description="Credentials live in server environment variables, never in the browser or database (except encrypted OAuth tokens)." back={{ href: "/admin/settings", label: "Settings" }} />
      {sp.google === "connected" && <Notice tone="green">Google Calendar connected.</Notice>}
      {sp.google === "error" && <Notice tone="red">Google Calendar connection failed. Try again.</Notice>}
      <Panel>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.detail}</p><p className="text-xs text-muted-foreground">Verification: {r.verified}</p></div>
              <div className="flex items-center gap-2">{r.action}<StatusBadge status={r.ok ? "active" : "pending"} tone={r.ok ? "green" : "amber"} /></div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Paystack webhook"><p className="text-sm">Set this URL in your Paystack dashboard (Settings → API Keys & Webhooks):</p><p className="mt-2 font-mono text-sm">{e.APP_URL}/api/webhooks/paystack</p><p className="mt-2 text-xs text-muted-foreground">Callback URL: {e.APP_URL}/checkout/complete</p></Panel>
    </div>
  );
}
