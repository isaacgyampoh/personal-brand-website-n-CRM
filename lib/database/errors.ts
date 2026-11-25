/** Helpers for mapping PostgreSQL errors to domain outcomes. */

export function pgCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export function pgMessage(error: unknown): string {
  return (error as { message?: string } | null)?.message ?? "";
}

export const isUniqueViolation = (e: unknown, constraint?: string) =>
  pgCode(e) === "23505" && (!constraint || (e as { constraint?: string }).constraint === constraint);

export const isExclusionViolation = (e: unknown) => pgCode(e) === "23P01";

/** Raised by our triggers with errcode P0001 and a SCREAMING_CASE token. */
export function raisedToken(e: unknown): string | undefined {
  if (pgCode(e) !== "P0001") return undefined;
  return pgMessage(e).split(":")[0]?.trim();
}
