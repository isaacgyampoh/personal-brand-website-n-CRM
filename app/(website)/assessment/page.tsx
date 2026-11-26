import { redirect } from "next/navigation";
import { firstPublishedAssessment } from "@/features/marketing/application/assessments";
import { EmptyState, PageHeader } from "@/components/website/page-header";

export const dynamic = "force-dynamic";

export default async function AssessmentIndex() {
  const a = await firstPublishedAssessment();
  if (a) redirect(`/assessment/${a.slug}`);
  return <><PageHeader eyebrow="Assessment" title="Personal brand *assessment*" /><EmptyState title="The assessment is being prepared." /></>;
}
