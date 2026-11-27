"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PublicPopup } from "@/features/popups/domain/popups";

// The pop-up UI and its stylesheet load only when there is something to show.
const PopupView = dynamic(() => import("./popup-view").then((m) => m.PopupView), { ssr: false });

const DAY = 86_400_000;
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
  sget(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch {} },
};

/** Frequency rules, applied in the browser (no tracking cookie). */
function allowed(p: PublicPopup, isMobile: boolean): boolean {
  if (p.devices === "mobile" && !isMobile) return false;
  if (p.devices === "desktop" && isMobile) return false;
  if (store.sget(`pp:closed:${p.id}`)) return false; // dismissed or clicked in this visit
  const closedAt = Number(store.get(`pp:closed:${p.id}`) ?? 0);
  if (closedAt && Date.now() - closedAt < p.dismissDays * DAY) return false;
  if (p.frequency !== "every_page" && store.sget(`pp:seen:${p.id}`)) return false; // once per visit
  return true;
}

function track(id: string, name: "impression" | "click" | "dismiss", path: string) {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return; // respected fully: no event, no attribution
  const body = JSON.stringify({ id, name, path });
  // keepalive so a click that navigates away is still recorded (and its attribution cookie set).
  void fetch("/api/popups/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

/**
 * Shows at most ONE pop-up per page: the highest-priority campaign the server
 * says is live for this page and that this visitor's frequency rules allow.
 * Waits for the page to be idle, so it never competes with page loading.
 */
export function PopupHost() {
  const path = usePathname();
  const [active, setActive] = useState<PublicPopup | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const run = async () => {
      try {
        const res = await fetch(`/api/popups?path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const { popups } = (await res.json()) as { popups: PublicPopup[] };
        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        const pick = popups.find((p) => allowed(p, isMobile));
        if (!pick || cancelled) return;
        const wait = Math.max(0, pick.delaySeconds * 1000 - (Date.now() - started));
        timer = setTimeout(() => {
          // Never stack on another open dialog (e.g. the mobile menu). Hidden dialogs in the DOM don't count.
          const openDialog = Array.from(document.querySelectorAll<HTMLElement>("[role=dialog][aria-modal=true]")).some((el) => !el.hidden && el.getClientRects().length > 0);
          if (cancelled || openDialog) return;
          store.sset(`pp:seen:${pick.id}`, "1");
          setActive(pick);
          track(pick.id, "impression", path);
        }, wait);
      } catch {}
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => void run(), { timeout: 2500 });
    else timer = setTimeout(() => void run(), 1200);
    return () => { cancelled = true; if (timer) clearTimeout(timer); setActive(null); };
  }, [path]);

  const close = useCallback((reason: "dismiss" | "expired") => {
    setActive((p) => {
      if (p && reason === "dismiss") {
        store.sset(`pp:closed:${p.id}`, "1");
        store.set(`pp:closed:${p.id}`, String(Date.now()));
        track(p.id, "dismiss", path);
      }
      return null;
    });
  }, [path]);

  const cta = useCallback(() => {
    if (!active) return;
    store.sset(`pp:closed:${active.id}`, "1");
    store.set(`pp:closed:${active.id}`, String(Date.now()));
    track(active.id, "click", path);
    if (active.kind !== "newsletter") setActive(null);
  }, [active, path]);

  if (!active) return null;
  return <PopupView popup={active} onClose={close} onCta={cta} />;
}
