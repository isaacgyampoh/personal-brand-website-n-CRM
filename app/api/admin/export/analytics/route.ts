import { getCurrentUser } from "@/lib/auth/session";
import { loadSetting } from "@/features/settings/application/settings";
import { resolveRange } from "@/features/analytics/application/range";
import { analyticsReport } from "@/features/analytics/application/reports";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !user.permissions.has("analytics:view")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const tz = (await loadSetting("business")).timezone;
  const a = await analyticsReport(resolveRange(sp, tz), tz);
  return csvResponse("analytics-daily.csv", toCsv(["Date", "Visitors", "Page views"], a.daily.map((d) => [d.day, d.visitors, d.views])));
}
