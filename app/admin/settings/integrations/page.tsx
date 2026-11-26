import { requireStaffPage } from "@/lib/auth/session";
import { hasRecentAuth } from "@/lib/auth/reauth";
import { env } from "@/lib/config/env";
import { vaultAvailable } from "@/lib/security/vault";
import { INTEGRATIONS } from "@/lib/integrations/definitions";
import { getIntegration, listIntegrationViews } from "@/lib/integrations/store";
import { PageTitle, Notice } from "@/components/dashboard/ui";
import { IntegrationCard, type CardView } from "@/components/dashboard/integration-card";
import { ReauthForm } from "@/components/dashboard/reauth-form";
import { listGoogleCalendars } from "@/features/integrations/application/google";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

/**
 * Integration Centre. Credentials are stored encrypted (AES-256-GCM, master
 * key outside the database). The browser only ever receives masked hints.
 */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string; reauth?: string }> }) {
  const user = await requireStaffPage("settings:manage", "/admin/settings/integrations");
  const sp = await searchParams;
  const [views, recent, google] = await Promise.all([listIntegrationViews(), hasRecentAuth(), getIntegration("google")]);
  const app = env().APP_URL;
  const calendars = google.all.refreshToken ? await listGoogleCalendars().catch(() => null) : null;
  const cards: CardView[] = views.map((v) => {
    const d = INTEGRATIONS.find((x) => x.provider === v.provider)!;
    const { urls, ...def } = d;
    return {
      def, urls: urls ? urls(app) : [], enabled: v.enabled, mode: v.mode, status: v.status,
      settings: Object.fromEntries(Object.entries(v.settings).map(([k, x]) => [k, Array.isArray(x) ? x.join(",") : String(x ?? "")])),
      secretHints: v.secretHints, lastSuccessAt: v.lastSuccessAt, lastFailureAt: v.lastFailureAt, lastError: v.lastError,
      googleConnected: d.provider === "google" ? Boolean(google.all.refreshToken) : undefined,
      calendars: d.provider === "google" ? calendars : undefined,
    };
  });
  const groups = [...new Set(INTEGRATIONS.map((d) => d.category))];
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Integrations" description="Connect payments, email, storage, calendars and meetings. Everything optional can stay off — the website keeps working." back={{ href: "/admin/settings", label: "Settings" }} />
      {!vaultAvailable() && <Notice tone="red">The server&apos;s credential encryption key is not set (CREDENTIALS_MASTER_KEYS). Integrations can&apos;t be saved until your server administrator adds it.</Notice>}
      {sp.google === "connected" && <Notice tone="green">Google account connected. Choose the calendar below and run Test connection.</Notice>}
      {sp.google === "error" && <Notice tone="red">Google connection failed. Check the client ID/secret and the authorised redirect URI, then try again.</Notice>}
      {(!recent || sp.reauth) && <ReauthForm mfa={user.mfaEnabled} />}
      <p className="text-sm text-muted-foreground">
        Status shows <strong>Connected</strong> only after a real connection test passes with the current settings. Saved secrets are never shown again — only the last characters.
      </p>
      {groups.map((g) => (
        <div key={g} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
          {cards.filter((c) => c.def.category === g).map((c) => <IntegrationCard key={c.def.provider} v={c} canGoLive={env().PAYMENTS_LIVE_APPROVED} />)}
        </div>
      ))}
    </div>
  );
}
