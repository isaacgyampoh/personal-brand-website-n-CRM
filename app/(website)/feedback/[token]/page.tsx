import type { Metadata } from "next";
import { FeedbackForm } from "@/components/portal/feedback-form";

export const metadata: Metadata = { title: "Feedback", robots: { index: false } };

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="site-container max-w-xl py-20">
      <h1 className="display-lg">How was the session?</h1>
      <p className="mt-4 text-[var(--muted-ink)]">Your feedback is read personally and helps shape future sessions.</p>
      <div className="mt-10"><FeedbackForm token={token} /></div>
    </div>
  );
}
