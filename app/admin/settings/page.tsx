import { requireStaffPage } from "@/lib/auth/session";
import { loadSettings } from "@/features/settings/application/settings";
import { PageTitle, Panel, LinkButton } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaffPage("settings:manage");
  const s = await loadSettings();
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Settings" actions={<><LinkButton href="/admin/settings/users" variant="outline">Team & roles</LinkButton><LinkButton href="/admin/settings/emails" variant="outline">Email templates</LinkButton><LinkButton href="/admin/settings/integrations" variant="outline">Integrations</LinkButton><LinkButton href="/admin/website/design" variant="outline">Brand & design</LinkButton></>} />
      <Panel title="Business"><SettingsForm settingKey="business" initial={s.business} fields={[
        { name: "timezone", label: "Business time zone (IANA, e.g. Africa/Accra)", type: "text" }, { name: "currency", label: "Default currency", type: "select", options: [["GHS", "GHS — Ghana cedi"], ["NGN", "NGN"], ["USD", "USD"], ["KES", "KES"], ["ZAR", "ZAR"]], hint: "Only currencies enabled on your Paystack account will work at checkout." },
        { name: "locale", label: "Locale", type: "text" }, { name: "legalName", label: "Registered business name (receipts)", type: "text" }, { name: "receiptFooter", label: "Receipt footer (e.g. tax ID)", type: "textarea" },
      ]} /></Panel>
      <Panel title="Contact details"><SettingsForm settingKey="contact" initial={s.contact} fields={[
        { name: "email", label: "Public email", type: "email" }, { name: "phone", label: "Phone", type: "text" }, { name: "address", label: "Address", type: "text" },
        { name: "city", label: "City", type: "text" }, { name: "country", label: "Country", type: "text" }, { name: "bookingNote", label: "Note shown on booking pages", type: "text" },
      ]} /></Panel>
      <Panel title="Social profiles"><SettingsForm settingKey="social" initial={s.social} fields={(["linkedin", "instagram", "x", "youtube", "tiktok", "facebook", "podcast"] as const).map((k) => ({ name: k, label: k[0].toUpperCase() + k.slice(1), type: "text" as const }))} /></Panel>
      <Panel title="Checkout"><SettingsForm settingKey="commerce" initial={s.commerce} fields={[
        { name: "holdMinutes", label: "Hold seats/slots during payment (minutes)", type: "text" }, { name: "allowDiscountCodes", label: "Allow discount codes", type: "checkbox" },
      ]} /></Panel>
      <Panel title="Email sender"><SettingsForm settingKey="email" initial={s.email} fields={[
        { name: "fromName", label: "Sender name", type: "text" }, { name: "replyTo", label: "Reply-to address", type: "email" },
        { name: "adminAlertEmail", label: "Where to send business alerts", type: "email" }, { name: "footerText", label: "Email footer", type: "textarea" },
      ]} /></Panel>
      <Panel title="Features"><SettingsForm settingKey="features" initial={s.features} fields={[
        { name: "shop", label: "Digital shop", type: "checkbox" }, { name: "academy", label: "Academy", type: "checkbox" }, { name: "assessment", label: "Brand assessment", type: "checkbox" },
        { name: "sms", label: "SMS reminders (requires mNotify)", type: "checkbox" }, { name: "ai", label: "AI content assistant (requires API key)", type: "checkbox" },
      ]} /></Panel>
    </div>
  );
}
