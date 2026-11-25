import { getCurrentUser } from "@/lib/auth/session";
import { exportContacts } from "@/features/crm/application/admin";
import { contactFilterSchema } from "@/features/crm/domain/segments";
import { csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("crm:export")) return new Response("Forbidden", { status: 403 });
  const params = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v));
  const f = contactFilterSchema.safeParse(params);
  const rows = await exportContacts(f.success ? f.data : {});
  await audit({ actorId: user.id, action: "contact.export", entityType: "contact", data: { count: rows.length, filter: params } });
  return csvResponse(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(
    ["Name", "Email", "Phone", "Company", "Job title", "Type", "Stage", "Tags", "Source", "Marketing consent", "Total spent (minor units)", "Created", "Last activity"],
    rows.map((c) => [c.full_name, c.email, c.phone, c.company, (c as { job_title?: string }).job_title, c.lifecycle, c.stage_name, c.tags.map((t) => t.name).join("; "), c.source, c.consent_marketing ? "yes" : "no", c.total_spent_minor, c.created_at, c.last_activity_at]),
  ));
}
