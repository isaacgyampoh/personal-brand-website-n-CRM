"use client";

import "./popup.css";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { subscribeAction } from "@/features/website/presentation/public-actions";
import type { PublicPopup } from "@/features/popups/domain/popups";

type Props = {
  popup: PublicPopup;
  /** "dismiss" = closed by the visitor; "expired" = countdown ran out (not counted as a dismissal). */
  onClose: (reason: "dismiss" | "expired") => void;
  onCta: () => void;
  mode?: "live" | "preview";
};

function useCountdown(to: string | undefined, onExpire: () => void) {
  const [left, setLeft] = useState<number | null>(null);
  const expire = useRef(onExpire);
  useEffect(() => { expire.current = onExpire; });
  useEffect(() => {
    if (!to) return;
    const end = Date.parse(to);
    const tick = () => {
      const ms = end - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) expire.current();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [to]);
  return left;
}

function Countdown({ ms }: { ms: number }) {
  const s = Math.floor(ms / 1000);
  const parts: [number, string][] = [[Math.floor(s / 86400), "Days"], [Math.floor((s % 86400) / 3600), "Hours"], [Math.floor((s % 3600) / 60), "Minutes"], [s % 60, "Seconds"]];
  const label = `${parts[0][0]} days, ${parts[1][0]} hours and ${parts[2][0]} minutes left to register`;
  return (
    <div className="pp-countdown-row" role="timer" aria-label={label}>
      {parts.map(([n, l]) => <div key={l} className="pp-unit" aria-hidden><b>{String(n).padStart(2, "0")}</b><span>{l}</span></div>)}
    </div>
  );
}

function Newsletter({ popupId, buttonText, onSubmit }: { popupId: string; buttonText: string; onSubmit: () => void }) {
  const [state, action, pending] = useActionState(subscribeAction, null);
  const id = useId();
  if (state?.ok) return <p role="status" className="pp-msg">Almost there — check your inbox and confirm your subscription.</p>;
  return (
    <form action={action} className="pp-form" onSubmit={onSubmit} noValidate>
      <input type="hidden" name="source" value={`p:${popupId}`} />
      <div className="pp-hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label htmlFor={`${id}-e`} className="sr-only">Email address</label>
      <input id={`${id}-e`} className="pp-field" name="email" type="email" required autoComplete="email" placeholder="Your email address" />
      <label className="pp-consent"><input type="checkbox" name="consent" required /> <span>I&apos;d like to receive emails. Unsubscribe anytime.</span></label>
      <button type="submit" className="pp-cta" disabled={pending}>{pending ? "Sending…" : buttonText || "Subscribe"}</button>
      {state && !state.ok && <p role="alert" className="pp-msg" data-tone="error">{state.fieldErrors?.email ?? state.fieldErrors?.consent ?? state.error}</p>}
    </form>
  );
}

/** One pop-up. Accessible dialog: labelled, focus moved in and restored, Tab trapped (modal layouts), Escape closes. */
export function PopupView({ popup: p, onClose, onCta, mode = "live" }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const uid = useId();
  const modal = p.layout !== "sheet";
  const left = useCountdown(p.layout === "countdown" ? p.event?.countdownTo : undefined, () => mode === "live" && onClose("expired"));

  useEffect(() => {
    if (mode !== "live") return;
    const before = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => card.current?.focus(), 30);
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    if (modal) html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose("dismiss"); return; }
      if (e.key !== "Tab" || !modal || !card.current) return;
      const f = Array.from(card.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([type=hidden]):not([tabindex='-1']),[tabindex='0']"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); html.style.overflow = prevOverflow; before?.focus?.(); };
  }, [mode, modal, onClose]);

  const style = {
    ...(p.colors.accent ? { "--pp-accent": p.colors.accent } : {}),
    ...(p.colors.background ? { "--pp-background": p.colors.background } : {}),
    ...(p.colors.text ? { "--pp-text": p.colors.text } : {}),
  } as React.CSSProperties;
  const showImage = p.image && p.layout !== "minimal";
  const external = /^https:\/\//.test(p.href);
  const e = p.event;

  return (
    <div className={`pp-root pp-${p.layout}`} data-mode={mode} style={style}>
      <div className="pp-stage">
      {modal && <div className="pp-backdrop" aria-hidden onClick={() => onClose("dismiss")} />}
      <div ref={card} className="pp-card" role="dialog" aria-modal={modal || undefined} aria-labelledby={`${uid}-h`} aria-describedby={p.body ? `${uid}-d` : undefined} tabIndex={-1}>
        <button type="button" className="pp-close" aria-label="Close" onClick={() => onClose("dismiss")}><span aria-hidden>×</span></button>
        {showImage && (
          <figure className="pp-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image!.src} srcSet={p.image!.srcSet} sizes="(max-width: 640px) 100vw, 420px" alt={p.image!.alt} decoding="async" />
          </figure>
        )}
        <div className="pp-body">
          {p.eyebrow && <p className="pp-eyebrow">{p.eyebrow}</p>}
          <h2 id={`${uid}-h`} className="pp-heading">{p.heading}</h2>
          {p.body && <p id={`${uid}-d`} className="pp-text">{p.body}</p>}
          {e && (
            <ul className="pp-meta" aria-label="Event details">
              <li>{e.dateLabel}</li>
              <li>{e.priceLabel}</li>
              {e.seatsLabel && <li className="pp-seats">{e.seatsLabel}</li>}
            </ul>
          )}
          {p.layout === "countdown" && left !== null && left > 0 && <Countdown ms={left} />}
          {e?.deadlineLabel && p.layout !== "countdown" && <p className="pp-text" style={{ fontSize: "0.82rem" }}>{e.deadlineLabel}</p>}
          {p.kind === "newsletter" ? (
            <Newsletter popupId={p.id} buttonText={p.buttonText} onSubmit={onCta} />
          ) : (
            <div className="pp-actions">
              <a className="pp-cta" href={p.href || "#"} onClick={(ev) => { if (mode !== "live") { ev.preventDefault(); return; } onCta(); }}
                {...(external ? { target: "_blank", rel: "noopener" } : {})}>
                {p.buttonText || "Learn more"}
              </a>
              {p.layout !== "flyer" && p.layout !== "sheet" && <button type="button" className="pp-later" onClick={() => onClose("dismiss")}>Maybe later</button>}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
