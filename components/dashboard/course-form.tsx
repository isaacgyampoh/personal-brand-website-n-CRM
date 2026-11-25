import { ActionForm, Check, Field, Select, Submit, TextArea } from "./forms";
import { MediaPicker } from "./media-picker";
import { saveCourseAction } from "@/features/academy/presentation/admin-actions";
import { minorToMajorString } from "@/lib/money";
import { plainText } from "@/features/content/domain/rich-text";

type Course = { id: string; title: string; slug: string; subtitle: string; summary: string; description: unknown; cover_media_id: string | null; category: string; level: string; price_minor: number; currency: string; visibility: string; certificate_enabled: boolean; completion_percent: number; require_quizzes_passed: boolean; outcomes: string[]; seo: { title?: string; description?: string } };

export function CourseForm({ c }: { c?: Course }) {
  return (
    <ActionForm action={saveCourseAction} className="grid gap-4 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Title" name="title" defaultValue={c?.title} required className="sm:col-span-2" />
      <Field label="Subtitle" name="subtitle" defaultValue={c?.subtitle} />
      <Field label="URL slug" name="slug" defaultValue={c?.slug} />
      <TextArea label="Summary" name="summary" defaultValue={c?.summary} rows={2} className="sm:col-span-2" />
      <TextArea label="Sales page description" name="description" defaultValue={c ? plainText(c.description) : ""} rows={6} className="sm:col-span-2" />
      <TextArea label="Outcomes (one per line)" name="outcomes" defaultValue={c?.outcomes.join("\n")} rows={4} className="sm:col-span-2" />
      <Field label="Price (0 = free)" name="price" defaultValue={c ? minorToMajorString(c.price_minor, c.currency) : "0"} />
      <Field label="Currency" name="currency" defaultValue={c?.currency ?? "GHS"} maxLength={3} />
      <Field label="Category" name="category" defaultValue={c?.category ?? "general"} />
      <Select label="Level" name="level" defaultValue={c?.level ?? "all"} options={[["all", "All levels"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]] as const} />
      <Select label="Visibility" name="visibility" defaultValue={c?.visibility ?? "public"} options={[["public", "Public (listed)"], ["unlisted", "Unlisted (link only)"], ["private", "Private (manual enrolment only)"]] as const} />
      <Field label="Complete at % of lessons" name="completionPercent" type="number" defaultValue={c?.completion_percent ?? 100} />
      <Check label="Issue certificate on completion" name="certificateEnabled" defaultChecked={c?.certificate_enabled ?? true} />
      <Check label="Require all quizzes passed" name="requireQuizzesPassed" defaultChecked={c?.require_quizzes_passed ?? true} />
      <div className="sm:col-span-2"><MediaPicker name="coverMediaId" label="Cover image" defaultId={c?.cover_media_id ?? ""} /></div>
      <Field label="SEO title" name="seoTitle" defaultValue={c?.seo?.title} />
      <Field label="SEO description" name="seoDescription" defaultValue={c?.seo?.description} />
      <div className="sm:col-span-2"><Submit>{c ? "Save course" : "Create course"}</Submit></div>
    </ActionForm>
  );
}
