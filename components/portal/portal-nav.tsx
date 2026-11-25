"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/portal", "Overview"], ["/portal/appointments", "Appointments"], ["/portal/events", "Masterclasses"], ["/portal/courses", "Courses"],
  ["/portal/library", "Library"], ["/portal/orders", "Receipts"], ["/portal/certificates", "Certificates"], ["/portal/profile", "Profile"],
] as const;

export function PortalNav() {
  const path = usePathname();
  return (
    <nav aria-label="Portal" className="site-container -mb-px flex gap-6 overflow-x-auto">
      {ITEMS.map(([href, label]) => {
        const active = href === "/portal" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.12em] ${active ? "border-[var(--ink)]" : "border-transparent text-[var(--muted-ink)] hover:text-[var(--ink)]"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
