"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type LinkItem = { label: string; href: string };

export function SiteHeader(props: { brandName: string; logoUrl: string; logoText: string; links: LinkItem[]; cta: LinkItem }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>("a,button"));
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl?.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => href !== "/" && pathname.startsWith(href);
  const mark = props.logoText || props.brandName;

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled ? "bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] shadow-[0_1px_0_var(--line)] backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="site-container flex h-[72px] items-center justify-between gap-6 md:h-[84px]">
        <Link href="/" className="flex min-h-11 items-center" aria-label={`${props.brandName} — home`}>
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" className="h-9 w-auto md:h-10" />
          ) : (
            <span className="font-display text-[1.65rem] leading-none tracking-[-0.01em] md:text-[1.85rem]">{mark}</span>
          )}
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {props.links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`relative py-2 text-[0.78rem] font-semibold uppercase tracking-[0.16em] transition-colors hover:text-[var(--brand-accent)] ${isActive(l.href) ? "text-[var(--brand-accent)]" : ""}`}
                  aria-current={isActive(l.href) ? "page" : undefined}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          {props.cta.label && (
            <Link href={props.cta.href} className="btn btn-primary hidden !min-h-11 !px-5 sm:inline-flex">
              {props.cta.label}
            </Link>
          )}
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-11 items-center justify-center lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="relative block h-3 w-6" aria-hidden>
              <span className={`absolute left-0 top-0 h-px w-6 bg-current transition-transform duration-300 ${open ? "translate-y-1.5 rotate-45" : ""}`} />
              <span className={`absolute bottom-0 left-0 h-px w-6 bg-current transition-transform duration-300 ${open ? "-translate-y-1.5 -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-[72px] z-40 overflow-y-auto bg-[var(--paper)] md:top-[84px] lg:hidden"
      >
        <nav aria-label="Mobile" className="site-container flex min-h-full flex-col pb-10 pt-6">
          <ul className="flex-1 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {props.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-16 items-center justify-between py-4 font-display text-[2rem] leading-none">
                  {l.label}
                  <span aria-hidden className="text-base text-[var(--muted-ink)]">→</span>
                </Link>
              </li>
            ))}
          </ul>
          {props.cta.label && (
            <Link href={props.cta.href} className="btn btn-primary mt-8 w-full">
              {props.cta.label}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
