import "server-only";
import { ZodError } from "zod";
import { RateLimitError } from "@/lib/security/rate-limit";
import { AuthorizationError } from "@/lib/auth/session";
import { UserError } from "@/lib/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };


export function toActionError(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  if (error instanceof RateLimitError || error instanceof AuthorizationError) return { ok: false, error: error.message };
  if (error instanceof UserError) return { ok: false, error: error.message };
  // Next.js redirect/notFound must propagate.
  if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_")) throw error;
  console.error("[action]", error);
  return { ok: false, error: "Something went wrong. Please try again, or contact us if it keeps happening." };
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}
