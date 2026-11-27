"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/**
 * Progressive-enhancement form bound to a server action. Shows field errors,
 * toasts the outcome and optionally redirects using `data.redirect`.
 */
export function ActionForm({ action, children, className, success = "Saved", resetOnSuccess = false, confirm }: {
  action: FormAction; children: React.ReactNode; className?: string; success?: string | false; resetOnSuccess?: boolean; confirm?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  // The outcome is announced as soon as the action finishes — not in an effect after
  // rendering. Toggle buttons (Publish ⇄ Unpublish, On ⇄ Off) are replaced by their
  // counterpart in the same update that delivers the result, so an effect would never
  // run (no message) or would run on the new button (wrong message). The message used
  // is the one of the button that was actually pressed.
  const pressed = useRef<{ success: string | false; resetOnSuccess: boolean }>({ success, resetOnSuccess });
  const run = useCallback(async (prev: ActionResult<unknown> | null, fd: FormData) => {
    const { success: msg, resetOnSuccess: reset } = pressed.current;
    const result = await action(prev, fd);
    if (result.ok) {
      const data = result.data as { redirect?: string } | undefined;
      if (msg) toast.success(result.message ?? msg);
      if (reset) ref.current?.reset();
      if (data?.redirect) router.push(data.redirect);
      else router.refresh();
    } else {
      toast.error(result.error || "Something went wrong. Please try again.");
    }
    return result;
  }, [action, router]);
  const [state, formAction] = useActionState(run, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
        pressed.current = { success, resetOnSuccess };
      }}
      data-errors={JSON.stringify(errors)}
    >
      <FieldErrorsContext errors={errors} />
      {children}
      {state && !state.ok && Object.keys(errors).length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-red-600" role="alert">
          {Object.entries(errors).map(([k, v]) => <li key={k}><span className="font-medium">{k}</span>: {v}</li>)}
        </ul>
      )}
    </form>
  );
}

function FieldErrorsContext({ errors }: { errors: Record<string, string> }) {
  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
      const name = el.dataset.field!;
      el.toggleAttribute("aria-invalid", Boolean(errors[name]));
    });
  }, [errors]);
  return null;
}

export function Submit({ children = "Save", variant = "default", className, name, value }: { children?: React.ReactNode; variant?: "default" | "outline" | "destructive" | "secondary"; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  const styles = {
    default: "bg-foreground text-background hover:bg-foreground/85",
    outline: "border bg-background hover:bg-muted",
    secondary: "bg-muted hover:bg-muted/70",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-60", styles[variant], className)}>
      {pending ? "Working…" : children}
    </button>
  );
}

const inputCls = "w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-red-500 disabled:opacity-60";

export function Field({ label, name, hint, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      <input name={name} data-field={name} className={cn(inputCls, "h-9")} {...props} />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, name, hint, className, rows = 4, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      <textarea name={name} rows={rows} data-field={name} className={inputCls} {...props} />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Select({ label, name, options, hint, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; options: { value: string; label: string }[] | readonly (readonly [string, string])[]; hint?: string }) {
  const opts = (options as unknown[]).map((o) => (Array.isArray(o) ? { value: o[0] as string, label: o[1] as string } : (o as { value: string; label: string })));
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      <select name={name} data-field={name} className={cn(inputCls, "h-9")} {...props}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Check({ label, name, hint, defaultChecked, className }: { label: string; name: string; hint?: string; defaultChecked?: boolean; className?: string }) {
  return (
    <label className={cn("flex items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded accent-foreground" />
      <span>{label}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </label>
  );
}

/** A one-button form for row-level actions (publish, delete, retry…). */
export function ActionButton({ action, fields, label, variant = "outline", confirm, success }: {
  action: FormAction; fields: Record<string, string>; label: string; variant?: "default" | "outline" | "destructive" | "secondary"; confirm?: string; success?: string;
}) {
  return (
    <ActionForm action={action} confirm={confirm} success={success ?? `${label} — done`} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit variant={variant} className="h-8 px-2.5 text-xs">{label}</Submit>
    </ActionForm>
  );
}
