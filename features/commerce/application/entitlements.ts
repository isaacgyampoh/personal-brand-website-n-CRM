import "server-only";
import { db, type Db } from "@/lib/database/pool";

export type ResourceType = "course" | "product" | "event";

export async function grantEntitlement(
  t: Db,
  input: { contactId: string; userId: string | null; resourceType: ResourceType; resourceId: string; orderId: string | null; source: "purchase" | "free" | "complimentary" | "manual" },
): Promise<string> {
  const row = await t.one<{ id: string }>(
    `insert into entitlements (contact_id, user_id, resource_type, resource_id, order_id, source)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (contact_id, resource_type, resource_id) where revoked_at is null do update set user_id = coalesce(entitlements.user_id, excluded.user_id)
     returning id`,
    [input.contactId, input.userId, input.resourceType, input.resourceId, input.orderId, input.source],
  );
  return row!.id;
}

export async function revokeOrderEntitlements(t: Db, orderId: string, reason: string): Promise<void> {
  await t.query(
    `update entitlements set revoked_at = now(), revoke_reason = $2 where order_id = $1 and revoked_at is null`,
    [orderId, reason],
  );
}

/**
 * Server-side access check used by every protected resource. Access is
 * granted only through an active entitlement belonging to the user's
 * verified contact record.
 */
export async function hasEntitlement(userId: string, resourceType: ResourceType, resourceId: string, executor: Db = db): Promise<string | null> {
  const row = await executor.one<{ id: string }>(
    `select e.id from entitlements e
       join contacts c on c.id = e.contact_id
      where c.user_id = $1 and e.resource_type = $2 and e.resource_id = $3
        and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
      limit 1`,
    [userId, resourceType, resourceId],
  );
  return row?.id ?? null;
}
