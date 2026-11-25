import { requireStaffPage } from "@/lib/auth/session";
import { loadSettings } from "@/features/settings/application/settings";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { toLocalInput } from "@/lib/time";

export const metadata = { title: "Navigation" };

export default async function NavigationPage() {
  await requireStaffPage("website:edit");
  const s = await loadSettings();
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Navigation, banner & links" back={{ href: "/admin/website", label: "Website" }} />
      <Panel title="Header & footer">
        <SettingsForm settingKey="navigation" initial={s.navigation} fields={[
          { name: "header", label: "Header menu", type: "links" },
          { name: "cta", label: "Header button", type: "link" },
          { name: "newsletterEyebrow", label: "Footer newsletter label", type: "text" },
          { name: "newsletterHeading", label: "Footer newsletter heading (*word* = italic)", type: "text" },
          { name: "footerColumns", label: "Footer columns", type: "columns" },
          { name: "footerNote", label: "Footer note", type: "text" },
        ]} />
      </Panel>
      <Panel title="Announcement banner" description="A slim bar above the header, e.g. for an upcoming masterclass.">
        <SettingsForm settingKey="announcement" initial={{ ...s.announcement, startsAt: s.announcement.startsAt ? toLocalInput(s.announcement.startsAt, "UTC") : "", endsAt: s.announcement.endsAt ? toLocalInput(s.announcement.endsAt, "UTC") : "" }} fields={[
          { name: "enabled", label: "Show banner", type: "checkbox" },
          { name: "text", label: "Message", type: "text" }, { name: "href", label: "Link", type: "text" },
          { name: "startsAt", label: "Show from (UTC, optional)", type: "datetime-local" }, { name: "endsAt", label: "Hide after (UTC, optional)", type: "datetime-local" },
        ]} />
      </Panel>
      <Panel title="Link-in-bio page" description={`Your mobile link page at /links — use it in your LinkedIn and Instagram profiles.`}>
        <SettingsForm settingKey="links" initial={s.links} fields={[
          { name: "headline", label: "Headline", type: "text" },
          { name: "items", label: "Links", type: "links", highlight: true, hint: "The next upcoming masterclass is added automatically at the top." },
        ]} />
      </Panel>
    </div>
  );
}
