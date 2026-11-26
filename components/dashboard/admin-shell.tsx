"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, LineChart, Users, Kanban, CheckSquare, Handshake, CalendarDays, Briefcase, Presentation, GraduationCap, ShoppingBag, Wallet, Globe, PenLine, Images, Quote, Megaphone, ClipboardList, Sparkles, Settings, Activity, Circle, Menu, X, Plug, ShieldCheck, Search, Bell, Receipt, Mic } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { LayoutDashboard, LineChart, Users, Kanban, CheckSquare, Handshake, CalendarDays, Briefcase, Presentation, GraduationCap, ShoppingBag, Wallet, Globe, PenLine, Images, Quote, Megaphone, ClipboardList, Sparkles, Settings, Activity, Circle, Menu, X, Plug, ShieldCheck, Search, Bell, Receipt, Mic };
import type { NavGroup } from "./nav";
import { cn } from "@/lib/utils";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Circle;
  return <C className={className} aria-hidden />;
}

function NavList({ groups, pathname, onNavigate }: { groups: NavGroup[]; pathname: string; onNavigate?: () => void }) {
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  // the most specific match wins (e.g. /admin/crm/pipeline over /admin/crm)
  const all = groups.flatMap((g) => g.items).filter((i) => active(i.href));
  const current = all.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Admin" className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={onNavigate}
                  aria-current={current === i.href ? "page" : undefined}
                  className={cn(
                    "flex min-h-9 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    current === i.href ? "bg-foreground text-background" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon name={i.icon} className="size-4 shrink-0" />
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ groups, user, brand, children }: { groups: NavGroup[]; user: { name: string; email: string; role: string }; brand: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const footer = (
    <div className="border-t p-3">
      <p className="truncate text-sm font-medium">{user.name || user.email}</p>
      <p className="truncate text-xs text-muted-foreground">{user.role.replace("_", " ")}</p>
      <div className="mt-2 flex gap-3 text-xs">
        <Link href="/" target="_blank" className="text-muted-foreground hover:text-foreground">View site ↗</Link>
        <form action="/auth/logout" method="post"><button className="text-muted-foreground hover:text-foreground">Sign out</button></form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/40 font-sans text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <Link href="/admin" className="flex h-14 items-center border-b px-5 text-[15px] font-semibold tracking-tight">{brand}<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">Studio</span></Link>
        <div className="flex-1 overflow-y-auto p-3"><NavList groups={groups} pathname={pathname} /></div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <button type="button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted">
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/admin" className="text-sm font-semibold">{brand}</Link>
        <span className="size-10" />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="text-sm font-semibold">{brand}</span>
              <button aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3"><NavList groups={groups} pathname={pathname} onNavigate={() => setOpen(false)} /></div>
            {footer}
          </div>
        </div>
      )}

      <main id="admin-main" className="lg:pl-60">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
