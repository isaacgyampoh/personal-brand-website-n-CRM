import { requireStaffPage } from "@/lib/auth/session";
import { loadSettings } from "@/features/settings/application/settings";
import { PageTitle, Panel } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/settings-form";

export const metadata = { title: "Brand & design" };

export default async function DesignPage() {
  await requireStaffPage("website:edit");
  const s = await loadSettings();
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Brand & design" description="Applies across the website, portal and emails instantly after saving." back={{ href: "/admin/website", label: "Website" }} />
      <Panel title="Brand identity">
        <SettingsForm settingKey="brand" initial={s.brand} fields={[
          { name: "name", label: "Brand / your name", type: "text" },
          { name: "professionalTitle", label: "Professional title", type: "text" },
          { name: "tagline", label: "Tagline", type: "text" },
          { name: "logoText", label: "Wordmark text (if no logo)", type: "text" },
          { name: "shortBio", label: "Short bio (used in structured data and link-in-bio)", type: "textarea" },
          { name: "logoUrl", label: "Logo", type: "image" },
          { name: "portraitUrl", label: "Portrait (link-in-bio and social)", type: "image" },
          { name: "portraitAlt", label: "Portrait description", type: "text" },
        ]} />
      </Panel>
      <Panel title="Colours & typography" description="Check text contrast stays readable (WCAG AA) when changing colours.">
        <SettingsForm settingKey="theme" initial={s.theme} fields={[
          { name: "ink", label: "Text / ink", type: "color" }, { name: "paper", label: "Background", type: "color" },
          { name: "surface", label: "Alternate section background", type: "color" }, { name: "accent", label: "Brand colour (buttons, highlights)", type: "color" },
          { name: "accentInk", label: "Text on brand colour", type: "color" }, { name: "muted", label: "Secondary text", type: "color" },
          { name: "deep", label: "Dark sections, hero & footer", type: "color" }, { name: "highlight", label: "Gold details on dark sections", type: "color" },
          { name: "fontPair", label: "Typography", type: "select", options: [["signature", "Signature — Fraunces + Manrope"], ["editorial", "Editorial — Cormorant Garamond + Manrope"], ["classic", "Classic — Playfair Display + Source Sans"], ["modern", "Modern — Instrument Serif + Inter"]] },
          { name: "corners", label: "Corners", type: "select", options: [["square", "Square (editorial)"], ["soft", "Softly rounded"]] },
        ]} />
      </Panel>
      <Panel title="Search & social defaults">
        <SettingsForm settingKey="seo" initial={s.seo} fields={[
          { name: "defaultTitle", label: "Default page title", type: "text" },
          { name: "titleTemplate", label: "Title template (%s = page title)", type: "text" },
          { name: "defaultDescription", label: "Default description", type: "textarea" },
          { name: "ogImageUrl", label: "Default social share image (1200×630)", type: "image" },
          { name: "xHandle", label: "X / Twitter handle", type: "text" },
          { name: "indexable", label: "Allow search engines to index the site (enable at launch)", type: "checkbox" },
        ]} />
      </Panel>
    </div>
  );
}
