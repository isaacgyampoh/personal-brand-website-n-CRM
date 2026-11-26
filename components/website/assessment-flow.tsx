"use client";

import { useState, useTransition } from "react";
import { submitAssessmentAction } from "@/features/website/presentation/public-actions";

type Q = { id: string; text: string; options: { id: string; label: string }[] };

export function AssessmentFlow({ slug, questions }: { slug: string; questions: Q[] }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lead, setLead] = useState({ email: "", fullName: "", consent: false });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = i >= questions.length;
  const q = questions[i];
  return (
    <div>
      <div className="mb-8 h-1 bg-[var(--line)]" role="progressbar" aria-valuenow={Math.min(i, questions.length)} aria-valuemin={0} aria-valuemax={questions.length} aria-label="Progress">
        <div className="h-1 bg-[var(--brand-accent)] transition-all" style={{ width: `${(Math.min(i, questions.length) / questions.length) * 100}%` }} />
      </div>
      {!done ? (
        <fieldset key={q.id}>
          <legend className="display-sm">{i + 1}. {q.text}</legend>
          <div className="mt-6 space-y-3">
            {q.options.map((o) => (
              <button key={o.id} type="button" onClick={() => { setAnswers({ ...answers, [q.id]: o.id }); setI(i + 1); }}
                className={`flex min-h-14 w-full items-center border px-5 py-3 text-left transition-colors hover:border-[var(--ink)] ${answers[q.id] === o.id ? "border-[var(--ink)] bg-[var(--surface)]" : "border-[var(--line)]"}`}>
                {o.label}
              </button>
            ))}
          </div>
          {i > 0 && <button type="button" className="btn btn-link mt-6 !p-0" onClick={() => setI(i - 1)}>← Back</button>}
        </fieldset>
      ) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => {
          const r = await submitAssessmentAction({ slug, answers, ...lead });
          if (r.ok && r.data) window.location.assign(r.data.redirect); else if (!r.ok) setError(r.error);
        }); }}>
          <p className="display-sm">Your results are ready.</p>
          <p className="text-[var(--muted-ink)]">Optionally leave your email to receive a personal follow-up. You can also just view your results.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="as-n" className="field-label">First name (optional)</label><input id="as-n" className="field" value={lead.fullName} onChange={(e) => setLead({ ...lead, fullName: e.target.value })} autoComplete="given-name" /></div>
            <div><label htmlFor="as-e" className="field-label">Email (optional)</label><input id="as-e" type="email" className="field" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} autoComplete="email" /></div>
          </div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={lead.consent} onChange={(e) => setLead({ ...lead, consent: e.target.checked })} className="mt-0.5 size-4" /><span>Yes, you may contact me about my results. My details are stored only if I tick this box.</span></label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-4"><button className="btn btn-primary" disabled={pending}>{pending ? "Calculating…" : "See my results"}</button><button type="button" className="btn btn-link" onClick={() => setI(questions.length - 1)}>Review answers</button></div>
        </form>
      )}
    </div>
  );
}
