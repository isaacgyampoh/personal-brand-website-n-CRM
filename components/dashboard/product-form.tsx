import { ActionForm, Check, Field, Select, Submit, TextArea } from "./forms";
import { MediaPicker } from "./media-picker";
import { saveProductAction } from "@/features/academy/presentation/admin-actions";
import { minorToMajorString } from "@/lib/money";
import { plainText } from "@/features/content/domain/rich-text";

type P = { id: string; title: string; slug: string; kind: string; summary: string; description: unknown; cover_media_id: string | null; file_media_id: string | null; price_minor: number; currency: string; is_lead_magnet: boolean; download_limit: number | null; seo: { title?: string; description?: string } };

export function ProductForm({ p }: { p?: P }) {
  return (
    <ActionForm action={saveProductAction} className="grid gap-4 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Title" name="title" defaultValue={p?.title} required />
      <Field label="URL slug" name="slug" defaultValue={p?.slug} />
      <Select label="Type" name="kind" defaultValue={p?.kind ?? "ebook"} options={[["ebook", "E-book"], ["guide", "Guide"], ["template", "Template"], ["workbook", "Workbook"], ["presentation", "Presentation template"], ["recording", "Recorded masterclass"], ["bundle", "Bundle"], ["other", "Other"]] as const} />
      <Field label="Download limit per customer (blank = unlimited)" name="downloadLimit" type="number" defaultValue={p?.download_limit ?? ""} />
      <Field label="Price" name="price" defaultValue={p ? minorToMajorString(p.price_minor, p.currency) : "0"} />
      <Field label="Currency" name="currency" defaultValue={p?.currency ?? "GHS"} maxLength={3} />
      <Check label="Free lead magnet (collects email with consent)" name="isLeadMagnet" defaultChecked={p?.is_lead_magnet} className="sm:col-span-2" />
      <TextArea label="Summary" name="summary" defaultValue={p?.summary} rows={2} className="sm:col-span-2" />
      <TextArea label="Description" name="description" defaultValue={p ? plainText(p.description) : ""} rows={6} className="sm:col-span-2" />
      <MediaPicker name="coverMediaId" label="Cover image" defaultId={p?.cover_media_id ?? ""} />
      <MediaPicker name="fileMediaId" label="Downloadable file (PRIVATE)" kind="file" visibility="private" defaultId={p?.file_media_id ?? ""} />
      <Field label="SEO title" name="seoTitle" defaultValue={p?.seo?.title} />
      <Field label="SEO description" name="seoDescription" defaultValue={p?.seo?.description} />
      <div className="sm:col-span-2"><Submit>{p ? "Save product" : "Create product"}</Submit></div>
    </ActionForm>
  );
}
