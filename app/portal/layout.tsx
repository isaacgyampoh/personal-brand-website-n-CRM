import { themeCss as themeCssFor } from "@/lib/theme";
import "../site.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "@/lib/cache";
import { requireUser } from "@/lib/auth/session";
import { attachVerifiedUser } from "@/features/crm/application/contacts";
import { PortalNav } from "@/components/portal/portal-nav";
import { EmailLink, EmailText } from "@/components/shared/email-text";

export const metadata: Metadata = { title: { default: "Your portal", template: "%s · Portal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/portal");
  await attachVerifiedUser(user.id);
  const s = await getPublicSettings();
  const css = themeCssFor(s.theme, ":root");
  return (
    <div className="site min-h-dvh">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="site-container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="font-display text-2xl">{s.brand.name}</Link>
          <div className="flex items-center gap-4 text-sm">
            {user.isStaff && <Link href="/admin" className="hidden underline-offset-4 hover:underline sm:inline">Studio</Link>}
            <span className="hidden text-[var(--muted-ink)] sm:inline">{user.fullName || <EmailText email={user.email} />}</span>
            <form action="/auth/logout" method="post"><button className="underline-offset-4 hover:underline">Sign out</button></form>
          </div>
        </div>
        <PortalNav />
      </header>
      {!user.emailVerified && (
        <div className="bg-amber-50 text-amber-900"><div className="site-container py-3 text-sm">Please verify your email address to see purchases made with it. Check your inbox for the link, or <Link href="/login" className="underline">sign in with an emailed link</Link>.</div></div>
      )}
      <main className="site-container py-10 md:py-14">{children}</main>
    </div>
  );
}
