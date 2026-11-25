export type EventLike = {
  status: "draft" | "published" | "cancelled" | "completed";
  starts_at: Date;
  ends_at: Date;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
};

export type TicketLike = {
  sales_start_at: Date | null;
  sales_end_at: Date | null;
  visibility: "public" | "hidden" | "complimentary";
};

export type RegistrationState = "draft" | "cancelled" | "not_open" | "open" | "closed" | "ended";

export function registrationState(e: EventLike, now = new Date()): RegistrationState {
  if (e.status === "draft") return "draft";
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "completed" || e.ends_at <= now) return "ended";
  if (e.registration_opens_at && e.registration_opens_at > now) return "not_open";
  const closes = e.registration_closes_at ?? e.starts_at;
  if (closes <= now) return "closed";
  return "open";
}

export function ticketOnSale(t: TicketLike, now = new Date()): boolean {
  if (t.visibility !== "public") return false;
  if (t.sales_start_at && t.sales_start_at > now) return false;
  if (t.sales_end_at && t.sales_end_at <= now) return false;
  return true;
}

export function timingLabel(e: Pick<EventLike, "starts_at" | "ends_at" | "status">, now = new Date()): "upcoming" | "live" | "past" | "cancelled" {
  if (e.status === "cancelled") return "cancelled";
  if (e.ends_at <= now) return "past";
  if (e.starts_at <= now) return "live";
  return "upcoming";
}

/** Join page opens `opensMinutesBefore` before start and closes 3h after end. */
export function joinWindow(startsAt: Date, endsAt: Date, opensMinutesBefore: number, now = new Date()): "too_early" | "open" | "closed" {
  if (now.getTime() < startsAt.getTime() - opensMinutesBefore * 60_000) return "too_early";
  if (now.getTime() > endsAt.getTime() + 3 * 3600_000) return "closed";
  return "open";
}
