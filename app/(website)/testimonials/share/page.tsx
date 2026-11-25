import type { Metadata } from "next";
import { PageHeader } from "@/components/website/page-header";
import { TestimonialForm } from "@/components/website/testimonial-form";

export const metadata: Metadata = { title: "Share a testimonial", robots: { index: false } };

export default function ShareTestimonialPage() {
  return (
    <>
      <PageHeader eyebrow="Feedback" title="Share your *experience*" intro="Thank you for taking a moment. You decide whether your words may be published." />
      <div className="site-container max-w-3xl pb-28"><TestimonialForm /></div>
    </>
  );
}
