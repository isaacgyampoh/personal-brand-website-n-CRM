"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeLessonAction, savePositionAction, submitAssignmentAction, submitQuizAction } from "@/features/portal/presentation/actions";

export function LessonControls({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-6">
      <button className={`btn ${completed ? "btn-outline" : "btn-primary"}`} disabled={pending} onClick={() => start(async () => {
        const r = await completeLessonAction(lessonId, !completed);
        if (!r.ok) setMsg(r.error);
        else if (r.data?.certificateCode) setMsg("Course complete — your certificate is ready in Certificates.");
        else if (r.data?.courseCompleted) setMsg("Course complete. Well done!");
        router.refresh();
      })}>{completed ? "Mark as not complete" : "Mark lesson complete"}</button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}

export function TrackedVideo({ lessonId, src }: { lessonId: string; src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const last = useRef(0);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (Math.abs(v.currentTime - last.current) > 15) { last.current = v.currentTime; void savePositionAction(lessonId, v.currentTime); }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [lessonId]);
  return <video ref={ref} controls controlsList="nodownload" preload="metadata" src={src} className="mt-8 w-full bg-black" />;
}

type Quiz = { id: string; passPercent: number; maxAttempts: number | null; questions: { id: string; prompt: string; multiple: boolean; options: { id: string; label: string }[] }[]; attempts: { score_percent: number; passed: boolean; created_at: string }[] };

export function QuizForm({ lessonId, quiz }: { lessonId: string; quiz: Quiz }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const passedBefore = quiz.attempts.some((a) => a.passed);
  const outOfAttempts = quiz.maxAttempts !== null && quiz.attempts.length >= quiz.maxAttempts;
  return (
    <form className="mt-10 space-y-8" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => {
      const r = await submitQuizAction(lessonId, answers);
      if (r.ok && r.data) { setResult(r.data); router.refresh(); } else if (!r.ok) setError(r.error);
    }); }}>
      <p className="text-sm text-[var(--muted-ink)]">Pass mark {quiz.passPercent}%.{quiz.maxAttempts ? ` ${quiz.maxAttempts - quiz.attempts.length} attempt(s) left.` : ""}{passedBefore ? " You've passed this quiz." : ""}</p>
      {quiz.questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="font-semibold">{i + 1}. {q.prompt}</legend>
          {q.options.map((o) => (
            <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--line)] px-4 py-2 hover:border-[var(--ink)]">
              <input type={q.multiple ? "checkbox" : "radio"} name={q.id} value={o.id} required={!q.multiple}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: q.multiple ? (e.target.checked ? [...(a[q.id] ?? []), o.id] : (a[q.id] ?? []).filter((x) => x !== o.id)) : [o.id] }))} />
              {o.label}
            </label>
          ))}
        </fieldset>
      ))}
      {result && <p role="status" className={`border-l-2 px-4 py-3 ${result.passed ? "border-green-700 bg-green-50" : "border-amber-600 bg-amber-50"}`}>You scored {result.score}%. {result.passed ? "Passed!" : "Not quite — review the lesson and try again."}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn btn-primary" disabled={pending || outOfAttempts}>{pending ? "Checking…" : "Submit answers"}</button>
    </form>
  );
}

export function AssignmentForm({ lessonId, existing }: { lessonId: string; existing: { body: string; status: string; feedback: string } | null }) {
  const [state, action, pending] = useActionState(submitAssignmentAction, null);
  return (
    <form action={action} className="mt-10 space-y-3">
      <input type="hidden" name="lessonId" value={lessonId} />
      {existing && <p className="text-sm">Status: <strong className="capitalize">{existing.status.replace("_", " ")}</strong>{existing.feedback && <> — feedback: {existing.feedback}</>}</p>}
      <label className="field-label" htmlFor="asg">Your response</label>
      <textarea id="asg" name="body" rows={8} defaultValue={existing?.body} className="field" />
      {state?.ok && <p role="status" className="text-sm">Submitted. Thank you!</p>}
      {state && !state.ok && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{existing ? "Update submission" : "Submit assignment"}</button>
    </form>
  );
}
