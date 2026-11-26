import { requireStaffPage } from "@/lib/auth/session";
import { AI_TASKS, aiUsageSummary } from "@/features/ai/application/assistant";
import { PageTitle, Notice } from "@/components/dashboard/ui";
import { AiAssistant } from "@/components/dashboard/ai-assistant";

export const metadata = { title: "AI assistant" };

export default async function AiPage({ searchParams }: { searchParams: Promise<{ task?: string; context?: string }> }) {
  await requireStaffPage("ai:use");
  const sp = await searchParams;
  const usage = await aiUsageSummary();
  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="AI content assistant" description={usage.enabled ? `${usage.used} of ${usage.limit} requests used this month · ${usage.model}` : "Optional — not enabled"} />
      {!usage.enabled ? (
        <Notice>The assistant is off. Everything else works without it. To enable: set <span className="font-mono">AI_ENABLED=true</span> and <span className="font-mono">ANTHROPIC_API_KEY</span> on the server (usage is capped by <span className="font-mono">AI_MONTHLY_REQUEST_LIMIT</span>).</Notice>
      ) : (
        <>
          <Notice tone="blue">Drafts are suggestions only. Review, fact-check and edit before publishing — nothing is posted automatically, and the assistant is instructed never to invent results or testimonials.</Notice>
          <AiAssistant tasks={Object.entries(AI_TASKS)} initialTask={sp.task && sp.task in AI_TASKS ? sp.task : "linkedin_post"} initialBrief={sp.context ?? ""} />
        </>
      )}
    </div>
  );
}
