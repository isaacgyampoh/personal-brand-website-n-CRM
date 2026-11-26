import "server-only";
import { db, tx } from "@/lib/database/pool";
import { randomToken } from "@/lib/security/crypto";
import { UserError } from "@/lib/errors";
import { upsertContact, logActivity } from "@/features/crm/application/contacts";
import { assessmentDefinitionSchema, scoreAssessment, type AssessmentDefinition, type AssessmentResult } from "../domain/assessment";

export type AssessmentRow = { id: string; slug: string; title: string; intro: string; definition: AssessmentDefinition; status: string };

export const publishedAssessment = (slug: string) =>
  db.one<AssessmentRow>("select * from assessments where slug = $1 and status = 'published'", [slug]);

export const firstPublishedAssessment = () =>
  db.one<AssessmentRow>("select * from assessments where status = 'published' order by created_at limit 1");

/** Scores a submission. Contact details are stored only with explicit consent. */
export async function submitAssessment(slug: string, answers: Record<string, string>, lead: { email?: string; fullName?: string; consent: boolean }): Promise<string> {
  const a = await publishedAssessment(slug);
  if (!a) throw new UserError("Assessment not found.");
  const def = assessmentDefinitionSchema.parse(a.definition);
  let result: AssessmentResult;
  try {
    result = scoreAssessment(def, answers);
  } catch {
    throw new UserError("Please answer every question.");
  }
  const token = randomToken(18);
  await tx(async (t) => {
    let contactId: string | null = null;
    if (lead.consent && lead.email) {
      const c = await upsertContact(t, { email: lead.email, fullName: lead.fullName, source: `assessment:${slug}` });
      contactId = c.id;
      await logActivity(t, c.id, "assessment", `Completed ${a.title}: ${result.overall}%`, { data: { scores: result.categories } });
      await t.query("update contacts set next_follow_up_at = coalesce(next_follow_up_at, now() + interval '2 days') where id = $1", [c.id]);
    }
    await t.query(
      `insert into assessment_responses (assessment_id, contact_id, answers, scores, overall_percent, result_token, consent_contact) values ($1,$2,$3,$4,$5,$6,$7)`,
      [a.id, contactId, JSON.stringify(answers), JSON.stringify(result), result.overall, token, lead.consent && Boolean(lead.email)],
    );
  });
  return token;
}

export async function assessmentResult(token: string) {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  return db.one<{ title: string; slug: string; scores: AssessmentResult; overall_percent: number; created_at: Date }>(
    "select a.title, a.slug, r.scores, r.overall_percent, r.created_at from assessment_responses r join assessments a on a.id = r.assessment_id where r.result_token = $1",
    [token],
  );
}

export const DEMO_ASSESSMENT: AssessmentDefinition = {
  categories: [
    { key: "clarity", label: "Brand clarity" }, { key: "positioning", label: "Professional positioning" },
    { key: "visibility", label: "LinkedIn visibility" }, { key: "engagement", label: "Audience engagement" },
    { key: "consistency", label: "Content consistency" }, { key: "authority", label: "Professional authority" },
    { key: "differentiation", label: "Brand differentiation" },
  ],
  questions: [
    { id: "q1", text: "Can you describe who you help and how in one sentence?", options: [{ id: "a", label: "Yes, instantly", scores: { clarity: 4 } }, { id: "b", label: "Roughly", scores: { clarity: 2 } }, { id: "c", label: "Not really", scores: { clarity: 0 } }] },
    { id: "q2", text: "Does your LinkedIn headline say what problem you solve?", options: [{ id: "a", label: "Yes", scores: { positioning: 4, visibility: 1 } }, { id: "b", label: "It lists my job title", scores: { positioning: 1 } }, { id: "c", label: "I haven't updated it in a while", scores: { positioning: 0 } }] },
    { id: "q3", text: "How often do you post professionally?", options: [{ id: "a", label: "Weekly or more", scores: { consistency: 4, visibility: 3 } }, { id: "b", label: "Monthly", scores: { consistency: 2, visibility: 1 } }, { id: "c", label: "Rarely", scores: { consistency: 0 } }] },
    { id: "q4", text: "Do people engage with (comment on, share) your content?", options: [{ id: "a", label: "Regularly", scores: { engagement: 4 } }, { id: "b", label: "Sometimes", scores: { engagement: 2 } }, { id: "c", label: "Hardly ever", scores: { engagement: 0 } }] },
    { id: "q5", text: "Are you invited to speak, write or advise because of your expertise?", options: [{ id: "a", label: "Often", scores: { authority: 4 } }, { id: "b", label: "Occasionally", scores: { authority: 2 } }, { id: "c", label: "Not yet", scores: { authority: 0 } }] },
    { id: "q6", text: "Could a stranger tell you apart from others in your field?", options: [{ id: "a", label: "Clearly", scores: { differentiation: 4 } }, { id: "b", label: "Somewhat", scores: { differentiation: 2 } }, { id: "c", label: "Probably not", scores: { differentiation: 0 } }] },
  ],
  bands: [
    { min: 0, max: 39, title: "Emerging brand", recommendation: "Start with clarity: define who you serve and the change you create, then rewrite your headline and About section around it." },
    { min: 40, max: 74, title: "Developing brand", recommendation: "Your foundations are in place. Build consistency with a simple weekly content rhythm and sharpen what makes you different." },
    { min: 75, max: 100, title: "Established brand", recommendation: "You have strong visibility. Focus on authority assets — speaking, signature frameworks and strategic partnerships." },
  ],
};
