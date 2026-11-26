import type { Metadata } from "next";
import { PageHeader } from "@/components/website/page-header";
import { TestimonialForm } from "@/components/website/testimonial-form";
import { contactForTestimonialToken } from "@/features/crm/application/testimonials";

export const metadata: Metadata = { title: "Share a testimonial", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ShareTestimonialPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const r = (await searchParams).r;
  const contact = await contactForTestimonialToken(r);
  return (
    <>
      <PageHeader eyebrow="Feedback" title="Share your *experience*" intro="Thank you for taking a moment. You decide whether your words may be published." />
      <div className="site-container max-w-3xl pb-28"><TestimonialForm token={contact ? r : undefined} name={contact?.name} email={contact?.email} /></div>
    </>
  );
}
