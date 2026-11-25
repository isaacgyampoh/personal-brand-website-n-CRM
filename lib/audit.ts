import "server-only";
import { db, type Db } from "@/lib/database/pool";

export type AuditEntry = {
  actorId?: string | null;
  actorLabel?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
  ipHash?: string | null;
};

/** Append-only audit trail (UPDATE/DELETE are blocked by a trigger). */
export async function audit(entry: AuditEntry, executor: Db = db): Promise<void> {
  await executor.query(
    `insert into audit_logs (actor_id, actor_label, action, entity_type, entity_id, data, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId ?? null,
      entry.actorLabel ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      JSON.stringify(entry.data ?? {}),
      entry.ipHash ?? null,
    ],
  );
}
