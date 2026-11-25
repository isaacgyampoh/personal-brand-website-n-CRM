import { z } from "zod";

/** Configurable personal-brand assessment. Scoring is deterministic (no AI). */
export const assessmentDefinitionSchema = z.object({
  categories: z.array(z.object({ key: z.string().regex(/^[a-z_]{2,30}$/), label: z.string().min(1).max(80), description: z.string().max(400).optional() })).min(1).max(12),
  questions: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]{1,30}$/),
    text: z.string().min(1).max(300),
    help: z.string().max(300).optional(),
    options: z.array(z.object({
      id: z.string().regex(/^[a-z0-9_]{1,30}$/),
      label: z.string().min(1).max(200),
      scores: z.record(z.string(), z.number().min(0).max(10)),
    })).min(2).max(8),
  })).min(1).max(40),
  bands: z.array(z.object({ min: z.number().min(0).max(100), max: z.number().min(0).max(100), title: z.string().max(100), recommendation: z.string().max(2000) })).max(10),
  categoryAdvice: z.record(z.string(), z.object({ low: z.string().max(1000), high: z.string().max(1000) })).optional(),
});
export type AssessmentDefinition = z.infer<typeof assessmentDefinitionSchema>;

export type AssessmentResult = {
  overall: number;
  categories: Record<string, { label: string; score: number; max: number; percent: number; advice?: string }>;
  band: AssessmentDefinition["bands"][number] | null;
};

export function scoreAssessment(def: AssessmentDefinition, answers: Record<string, string>): AssessmentResult {
  const categories: AssessmentResult["categories"] = {};
  for (const c of def.categories) categories[c.key] = { label: c.label, score: 0, max: 0, percent: 0 };
  for (const q of def.questions) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (!chosen) throw new Error(`Question "${q.text}" is unanswered`);
    for (const c of def.categories) {
      const max = Math.max(0, ...q.options.map((o) => o.scores[c.key] ?? 0));
      if (max === 0) continue;
      categories[c.key].max += max;
      categories[c.key].score += chosen.scores[c.key] ?? 0;
    }
  }
  let total = 0, totalMax = 0;
  for (const [key, c] of Object.entries(categories)) {
    c.percent = c.max ? Math.round((c.score / c.max) * 100) : 0;
    total += c.score;
    totalMax += c.max;
    const advice = def.categoryAdvice?.[key];
    if (advice) c.advice = c.percent < 60 ? advice.low : advice.high;
  }
  const overall = totalMax ? Math.round((total / totalMax) * 100) : 0;
  const band = def.bands.find((b) => overall >= b.min && overall <= b.max) ?? null;
  return { overall, categories, band };
}
