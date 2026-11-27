import "../globals.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicSettings } from "@/lib/cache";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { ADMIN_NAV } from "@/components/dashboard/nav";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · Studio" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Shell only. Every admin page, server action and route handler performs its
 * own permission check; hiding navigation is never relied on for security.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isStaff) redirect("/portal");
  const s = await getPublicSettings();
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => user.permissions.has(i.permission)) })).filter((g) => g.items.length);
  return (
    <>
      <AdminShell groups={groups} user={{ name: user.fullName, email: user.email, role: user.role }} brand={s.brand.name}>{children}</AdminShell>
      <Toaster position="top-right" richColors />
    </>
  );
}
