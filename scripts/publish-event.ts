/**
 * Operator tool: creates and publishes an event from a JSON spec on stdin (flyer as base64),
 * through the same services Studio uses (media pipeline, event, ticket, publish, pop-up switch).
 * Re-running with the same slug updates the existing event instead of duplicating it.
 *
 *   cat spec.json | docker compose exec -T worker npx tsx --tsconfig tsconfig.worker.json scripts/publish-event.ts
 */
import { db, closePool } from "@/lib/database/pool";
import { uploadMedia } from "@/features/media/application/media";
import { saveEvent, saveTicket, setEventStatus } from "@/features/events/application/admin";
import { setEventPopup } from "@/features/popups/application/popups";
import { requestRevalidation } from "@/features/automation/application/scheduled";

type Spec = {
  event: Record<string, unknown> & { slug: string; startsAt: string; endsAt: string };
  ticket: { name: string; price: string; currency: string; description?: string };
  flyer?: { base64: string; filename: string; alt: string };
  popup?: boolean;
};

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const spec = JSON.parse(raw) as Spec;
  const owner = await db.one<{ id: string }>("select id from users where role = 'owner' order by created_at limit 1");
  if (!owner) throw new Error("No owner account");
  const actor = owner.id;

  let flyerId = "";
  if (spec.flyer) {
    const r = await uploadMedia({ bytes: Buffer.from(spec.flyer.base64, "base64"), filename: spec.flyer.filename, visibility: "public", altText: spec.flyer.alt, category: "events", actorId: actor });
    flyerId = r.asset.id;
    console.log(`flyer uploaded (${r.asset.id})`);
  }
  const existing = await db.one<{ id: string }>("select id from events where slug = $1", [spec.event.slug]);
  const id = await saveEvent(existing?.id ?? null, {
    ...spec.event, startsAt: new Date(spec.event.startsAt), endsAt: new Date(spec.event.endsAt),
    registrationOpensAt: null, registrationClosesAt: spec.event.registrationClosesAt ? new Date(String(spec.event.registrationClosesAt)) : null,
    ...(flyerId ? { flyerMediaId: flyerId, coverMediaId: flyerId } : {}),
  }, actor);
  const t = await db.one<{ id: string }>("select id from ticket_types where event_id = $1 order by position limit 1", [id]);
  await saveTicket({ id: t?.id ?? "", eventId: id, ...spec.ticket, salesStartAt: null, salesEndAt: null }, actor);
  const status = await db.one<{ status: string }>("select status from events where id = $1", [id]);
  if (status?.status !== "published") await setEventStatus(id, "publish", actor);
  if (spec.popup) await setEventPopup(id, true, actor);
  console.log(`event ${existing ? "updated" : "created"} and published: /masterclasses/${spec.event.slug}${spec.popup ? " (pop-up on)" : ""}`);
  await requestRevalidation(["events", "popups", "pages"]).catch((e) => console.warn("Cache refresh failed — restart the web app:", (e as Error).message));
}

main().catch((e) => { console.error("publish-event failed:", (e as Error).message); process.exitCode = 1; }).finally(() => closePool());
