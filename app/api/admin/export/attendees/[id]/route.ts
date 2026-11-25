import { getCurrentUser } from "@/lib/auth/session";
import { attendees } from "@/features/events/application/admin";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("events:view")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const rows = await attendees(id);
  return csvResponse(`attendees-${id.slice(0, 8)}.csv`, toCsv(
    ["Reference", "Name", "Email", "Ticket", "Status", "Source", "Order", "Order status", "Attended", "Registered"],
    rows.map((r) => [r.reference, r.attendee_name, r.attendee_email, r.ticket, r.status, r.source, r.order_reference, r.order_status, r.attended_at ? "yes" : "no", r.created_at]),
  ));
}
