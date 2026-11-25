import "server-only";
import { db, type Db } from "@/lib/database/pool";

/** Public event columns. event_access (meeting links) is NEVER selected here. */
export const PUBLIC_EVENT_COLUMNS = `e.id, e.slug, e.title, e.subtitle, e.kind, e.format, e.summary, e.description, e.cover_media_id,
  e.flyer_media_id, e.venue_name, e.venue_address, e.timezone, e.starts_at, e.ends_at, e.capacity, e.registration_opens_at,
  e.registration_closes_at, e.waitlist_enabled, e.speakers, e.agenda, e.faqs, e.certificate_enabled, e.status,
  e.cancellation_reason, e.seo, e.published_at, e.is_demo`;

export type EventRow = {
  id: string; slug: string; title: string; subtitle: string; kind: string; format: "online" | "in_person" | "hybrid";
  summary: string; description: unknown; cover_media_id: string | null; flyer_media_id: string | null; venue_name: string;
  venue_address: string; timezone: string; starts_at: Date; ends_at: Date; capacity: number | null;
  registration_opens_at: Date | null; registration_closes_at: Date | null; waitlist_enabled: boolean;
  speakers: { name: string; title?: string; bio?: string; photoUrl?: string }[];
  agenda: { time: string; title: string; description?: string }[];
  faqs: { q: string; a: string }[];
  certificate_enabled: boolean; status: "draft" | "published" | "cancelled" | "completed"; cancellation_reason: string | null;
  seo: Record<string, string>; published_at: Date | null; is_demo: boolean;
  cover_url?: string | null;
};

export type TicketRow = {
  id: string; event_id: string; name: string; description: string; price_minor: number; currency: string;
  capacity: number | null; sales_start_at: Date | null; sales_end_at: Date | null; max_per_order: number;
  visibility: "public" | "hidden" | "complimentary"; position: number;
};

export const eventRepo = {
  bySlug: (slug: string, t: Db = db) =>
    t.one<EventRow>(
      `select ${PUBLIC_EVENT_COLUMNS}, m.storage_key as cover_key from events e left join media_assets m on m.id = e.cover_media_id where e.slug = $1`,
      [slug],
    ),
  byId: (id: string, t: Db = db) =>
    t.one<EventRow>(`select ${PUBLIC_EVENT_COLUMNS} from events e where e.id = $1`, [id]),
  tickets: (eventId: string, t: Db = db) =>
    t.query<TicketRow>("select * from ticket_types where event_id = $1 order by position, price_minor", [eventId]),

  /** Seats currently held or sold (reserved holds count until they expire). */
  async seatCounts(eventId: string, t: Db = db): Promise<{ total: number; byTicket: Map<string, number> }> {
    const rows = await t.query<{ ticket_type_id: string; n: number }>(
      `select ticket_type_id, count(*)::int as n from event_registrations
        where event_id = $1 and (status = 'confirmed' or (status = 'reserved' and hold_expires_at > now()))
        group by ticket_type_id`,
      [eventId],
    );
    const byTicket = new Map(rows.map((r) => [r.ticket_type_id, r.n]));
    return { total: rows.reduce((s, r) => s + r.n, 0), byTicket };
  },
};

export function remainingFor(event: Pick<EventRow, "capacity">, ticket: Pick<TicketRow, "id" | "capacity">, counts: { total: number; byTicket: Map<string, number> }): number | null {
  const ev = event.capacity === null ? Infinity : event.capacity - counts.total;
  const tk = ticket.capacity === null ? Infinity : ticket.capacity - (counts.byTicket.get(ticket.id) ?? 0);
  const r = Math.min(ev, tk);
  return r === Infinity ? null : Math.max(0, r);
}
