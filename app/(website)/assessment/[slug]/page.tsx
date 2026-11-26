import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publishedAssessment } from "@/features/marketing/application/assessments";
import { AssessmentFlow } from "@/components/website/assessment-flow";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await publishedAssessment((await params).slug);
  return a ? { title: a.title, description: a.intro } : {};
}

export default async function AssessmentPage({ params }: Props) {
  const a = await publishedAssessment((await params).slug);
  if (!a) notFound();
  return (
    <div className="site-container max-w-3xl pb-28 pt-10 md:pt-16">
      <p className="eyebrow eyebrow-rule">Free assessment · {a.definition.questions.length} questions</p>
      <h1 className="display-lg mt-6">{a.title}</h1>
      {a.intro && <p className="lede mt-6">{a.intro}</p>}
      <div className="mt-12"><AssessmentFlow slug={a.slug} questions={a.definition.questions.map((q) => ({ id: q.id, text: q.text, options: q.options.map((o) => ({ id: o.id, label: o.label })) }))} /></div>
    </div>
  );
}
