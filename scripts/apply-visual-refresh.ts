/**
 * One-off: applies the 2026 visual refresh to an existing site — new design tokens
 * (palette + Signature typography) and the homepage section rhythm. Content is not
 * rewritten; only tones/layout props change, and the hero credential is copied from
 * the site's own (already published) credentials block. Everything remains editable
 * in Studio afterwards. Runs through the app's services, so history/audit apply.
 *
 *   tsx --tsconfig tsconfig.worker.json scripts/apply-visual-refresh.ts
 */
import { db, closePool } from "@/lib/database/pool";
import { loadSettings, saveSetting } from "@/features/settings/application/settings";
import { publishPage, saveDraft } from "@/features/website/application/pages";
import { requestRevalidation } from "@/features/automation/application/scheduled";

type Block = { type: string; props: Record<string, unknown> };

const THEME = {
  ink: "#1f1418", paper: "#ffffff", surface: "#f8eef0", accent: "#8c2350", accentInk: "#ffffff",
  muted: "#6b5a60", deep: "#3a1526", highlight: "#d4a66a", fontPair: "signature", corners: "soft",
} as const;

/** Section tone per block type on the homepage (in order of appearance). */
const HOME_TONES: Record<string, string> = {
  Hero: "ink", Stats: "paper", ImageText: "surface", Introduction: "surface", Services: "paper", Logos: "surface",
  Speaking: "ink", Events: "paper", Gallery: "surface", Testimonials: "paper", CallToAction: "accent",
};

async function main() {
  const owner = await db.one<{ id: string }>("select id from users where role = 'owner' order by created_at limit 1");
  if (!owner) throw new Error("No owner account");
  const actor = owner.id;

  const s = await loadSettings();
  await saveSetting("theme", { ...s.theme, ...THEME }, actor);
  console.log("theme: palette + Signature typography applied");

  const home = await db.one<{ id: string; seo: unknown; published_content: { root: unknown; content: Block[] } | null; draft_content: { root: unknown; content: Block[] } | null }>(
    "select id, seo, published_content, draft_content from pages where slug = 'home'");
  const doc = home?.published_content ?? home?.draft_content;
  if (!home || !doc) throw new Error("No home page");
  const stats = doc.content.find((b) => b.type === "Stats")?.props.items as { value?: string; label?: string; note?: string }[] | undefined;
  const award = stats?.find((i) => /^No\.?\s*1/i.test(i.value ?? ""));
  const content = doc.content.map((b) => {
    const props: Record<string, unknown> = { ...b.props, tone: HOME_TONES[b.type] ?? b.props.tone };
    if (b.type === "Hero") {
      props.variant = "editorial";
      if (award && !props.badgeTitle) { props.badgeTitle = `${award.value} — ${award.label}`; props.badgeText = award.note ?? ""; }
    }
    return { ...b, props };
  });
  await saveDraft(home.id, { root: doc.root ?? { props: {} }, content }, home.seo ?? {}, actor); // keep the page's SEO
  await publishPage(home.id, actor, "Visual refresh: section rhythm");
  console.log(`home: ${content.length} sections re-toned${award ? `; hero credential: ${award.value} ${award.label}` : ""}`);

  await requestRevalidation(["settings", "pages"]).catch((e) => console.warn("Cache refresh failed — restart the web app:", (e as Error).message));
}

main().catch((e) => { console.error("apply-visual-refresh failed:", (e as Error).message); process.exitCode = 1; }).finally(() => closePool());
