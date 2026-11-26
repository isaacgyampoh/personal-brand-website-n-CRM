import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/database/pool";
import { getIntegration } from "@/lib/integrations/store";
import { UserError } from "@/lib/errors";
import { loadSettings } from "@/features/settings/application/settings";

/**
 * Optional AI drafting assistant. Disabled unless AI_ENABLED=true and an
 * ANTHROPIC_API_KEY is configured; nothing else in the platform depends on it.
 * Output is ALWAYS a draft for a human to review — it is never published
 * automatically. The API key stays server-side.
 */
export class AiError extends UserError {}

export const AI_TASKS = {
  linkedin_post: "LinkedIn post draft",
  article_outline: "Article outline",
  content_ideas: "Content ideas",
  caption: "Marketing caption",
  newsletter: "Newsletter draft",
  masterclass_description: "Masterclass description",
  email: "Email draft",
  repurpose: "Repurpose content",
  headline: "Headline suggestions",
  edit: "Grammar & tone improvement",
} as const;
export type AiTask = keyof typeof AI_TASKS;

const TASK_GUIDE: Record<AiTask, string> = {
  linkedin_post: "Write one LinkedIn post (150–250 words): a strong first line, short paragraphs, a single clear takeaway, and a closing question. No hashtags spam — at most three relevant hashtags.",
  article_outline: "Produce an article outline: working title, one-sentence thesis, 5–7 section headings each with 2–3 bullet points, and a closing call to action.",
  content_ideas: "Suggest 10 distinct content ideas as a numbered list. Each: a working title and one sentence on the angle.",
  caption: "Write 3 alternative short marketing captions (under 40 words each).",
  newsletter: "Draft a newsletter issue: subject line, preview text, then a 300–450 word body with a personal opening and one clear call to action.",
  masterclass_description: "Write a masterclass landing-page description: a compelling summary (2 sentences), who it is for, what attendees will learn (4–6 bullets), and the format.",
  email: "Draft a professional email. Keep it concise and warm.",
  repurpose: "Repurpose the provided content into: one LinkedIn post, three short social captions, and a 3-bullet newsletter teaser.",
  headline: "Suggest 8 headline options in varied styles (direct, curiosity, benefit-led, number-led).",
  edit: "Improve grammar, clarity and tone of the provided text while preserving the author's voice and meaning. Return only the revised text.",
};

const inputSchema = z.object({
  task: z.enum(Object.keys(AI_TASKS) as [AiTask, ...AiTask[]]),
  brief: z.string().trim().min(3, "Describe what you need").max(8000),
  tone: z.enum(["warm", "authoritative", "conversational", "inspiring", "concise"]).default("warm"),
});

/** AI is optional: available only when enabled and configured in Settings → Integrations. */
export async function aiAvailable(): Promise<boolean> {
  return (await getIntegration("ai")).usable;
}

async function aiConfig() {
  const c = await getIntegration("ai");
  const limit = Number.parseInt(c.values.monthlyLimit, 10);
  return { usable: c.usable, apiKey: c.values.apiKey, model: c.values.model || "claude-opus-5-5", limit: Number.isFinite(limit) && limit > 0 ? limit : 300 };
}

/** Minimal authenticated request used by the Integration Centre "Test connection" button. */
export async function testAiConnection(apiKey: string, model: string): Promise<string> {
  const c = new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 });
  const m = await c.models.retrieve(model);
  return `API key accepted; model ${m.id} available`;
}

async function monthlyUsage(): Promise<number> {
  const r = await db.one<{ n: number }>("select count(*)::int as n from ai_usage where created_at >= date_trunc('month', now())");
  return r?.n ?? 0;
}

export async function aiUsageSummary() {
  const c = await aiConfig();
  return { used: await monthlyUsage(), limit: c.limit, model: c.model, enabled: c.usable };
}

let client: { key: string; sdk: Anthropic } | undefined;

export async function generateDraft(raw: unknown, userId: string): Promise<{ text: string; model: string }> {
  const cfg = await aiConfig();
  if (!cfg.usable) throw new AiError("The AI assistant is not enabled. Configure it in Settings → Integrations.");
  const input = inputSchema.parse(raw);
  const limit = cfg.limit;
  if ((await monthlyUsage()) >= limit) throw new AiError(`This month's AI request limit (${limit}) has been reached. It resets on the 1st, or raise the limit in Settings → Integrations.`);

  const s = await loadSettings();
  if (client?.key !== cfg.apiKey) client = { key: cfg.apiKey, sdk: new Anthropic({ apiKey: cfg.apiKey, maxRetries: 2, timeout: 90_000 }) };

  // Stable system prompt (cache-friendly); task details go in the user turn.
  const system = [
    `You are a writing assistant for ${s.brand.name}${s.brand.professionalTitle ? `, ${s.brand.professionalTitle}` : ""}.`,
    s.brand.shortBio ? `About them: ${s.brand.shortBio}` : "",
    "Write in British English. Write as the brand owner in the first person unless asked otherwise.",
    "Never invent statistics, client results, testimonials, credentials, awards or quotes. If a claim would need a fact you don't have, leave a clearly marked placeholder like [ADD REAL EXAMPLE].",
    "Return plain text only (no Markdown headings or bold markers), ready to paste.",
  ].filter(Boolean).join("\n");

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.sdk.beta.messages.create({
      model: cfg.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: `Task: ${TASK_GUIDE[input.task]}\nTone: ${input.tone}\n\nBrief / source material:\n${input.brief}` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new AiError("The AI service is busy. Please try again in a minute.");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AiError("The AI service rejected the API key. Check the key in Settings → Integrations.");
    if (error instanceof Anthropic.BadRequestError) { console.error("[ai] bad request", error.message); throw new AiError("The AI request was rejected. Try a shorter or different brief."); }
    if (error instanceof Anthropic.APIConnectionError) throw new AiError("Couldn't reach the AI service. Check the server's internet connection.");
    if (error instanceof Anthropic.APIError) { console.error("[ai]", error.status, error.message); throw new AiError("The AI service had a problem. Please try again."); }
    throw error;
  }

  await db.query(
    "insert into ai_usage (user_id, task, model, input_tokens, output_tokens) values ($1,$2,$3,$4,$5)",
    [userId, input.task, response.model, response.usage.input_tokens, response.usage.output_tokens],
  );
  if (response.stop_reason === "refusal") throw new AiError("The AI declined this request. Try rephrasing the brief.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  if (!text) throw new AiError("No draft was produced. Please try again.");
  return { text: response.stop_reason === "max_tokens" ? `${text}\n\n[Draft was cut short — ask for a shorter version.]` : text, model: response.model };
}
