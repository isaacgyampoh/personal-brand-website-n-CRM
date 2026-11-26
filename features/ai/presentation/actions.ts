"use server";

import { assertPermission } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { rateLimit } from "@/lib/security/rate-limit";
import { generateDraft } from "../application/assistant";

export async function generateDraftAction(input: { task: string; brief: string; tone: string }): Promise<ActionResult<{ text: string; model: string }>> {
  return runAction(async () => {
    const u = await assertPermission("ai:use");
    await rateLimit(`ai:${u.id}`, 20, 600);
    return generateDraft(input, u.id);
  });
}
