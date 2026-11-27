"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/dashboard/forms";
import { MediaPicker } from "@/components/dashboard/media-picker";
import { PopupView } from "@/components/website/popup-view";
import { savePopupAction, previewPopupAction } from "@/features/popups/presentation/actions";
import { POPUP_KINDS, POPUP_LAYOUTS, type PublicPopup } from "@/features/popups/domain/popups";

export type PopupFormValues = {
  id: string; name: string; kind: string; eventId: string; layout: string; eyebrow: string; heading: string; body: string; buttonText: string;
  destination: string; imageMediaId: string; accent: string; background: string; text: string; pages: string; pagePaths: string;
  devices: string; delaySeconds: string; frequency: string; dismissDays: string; priority: string; startsAt: string; endsAt: string;
};

const FRAMES = { desktop: { w: 1280, h: 760, label: "Desktop" }, tablet: { w: 820, h: 1000, label: "Tablet" }, mobile: { w: 390, h: 780, label: "Mobile" } } as const;

/** Scaled device frame with a mock page behind the pop-up, so the preview reads like the real site. */
function Frame({ device, theme, children }: { device: keyof typeof FRAMES; theme: React.CSSProperties; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const f = FRAMES[device];
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / f.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.w]);
  return (
    <div ref={outer} className="w-full">
      <div className="mx-auto overflow-hidden rounded-xl border shadow-sm" style={{ width: f.w * scale, height: f.h * scale }}>
        <div style={{ width: f.w, height: f.h, transform: `scale(${scale})`, transformOrigin: "0 0", position: "relative", background: "var(--paper)", ...theme }}>
          <div aria-hidden style={{ padding: device === "mobile" ? 20 : 48, color: "var(--ink)", fontFamily: "var(--site-body)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 56, opacity: 0.6 }}><b style={{ fontFamily: "var(--site-display)", fontSize: 22 }}>Your website</b><span>Menu</span></div>
            <div style={{ fontFamily: "var(--site-display)", fontSize: device === "mobile" ? 34 : 64, lineHeight: 1, maxWidth: 700 }}>The page your visitors are reading</div>
            {[90, 75, 82, 60].map((w, i) => <div key={i} style={{ height: 12, width: `${w}%`, background: "color-mix(in oklab, var(--ink) 10%, transparent)", marginTop: i ? 14 : 36, borderRadius: 4 }} />)}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PopupEditor({ initial, events, theme }: {
  initial: PopupFormValues;
  events: { id: string; label: string }[];
  theme: React.CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState(initial.kind);
  const [pages, setPages] = useState(initial.pages);
  const [device, setDevice] = useState<keyof typeof FRAMES>("desktop");
  const [preview, setPreview] = useState<{ popup: PublicPopup | null; note: string | null }>({ popup: null, note: null });
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = box.current?.closest("form");
      if (!form) return;
      const values = Object.fromEntries(Array.from(new FormData(form).entries()).map(([k, v]) => [k, String(v)]));
      start(async () => { setPreview(await previewPopupAction(values)); });
    }, 350);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ActionForm action={savePopupAction} success="Saved">
      <div ref={box} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" onChange={refresh} onInput={refresh}>
        <div className="space-y-6">
          <input type="hidden" name="id" value={initial.id} />
          <fieldset className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">What it promotes</legend>
            <Field label="Name (only you see this)" name="name" defaultValue={initial.name} required className="sm:col-span-2" />
            <Select label="Type" name="kind" options={POPUP_KINDS} defaultValue={initial.kind} onChange={(e) => setKind(e.target.value)} className="sm:col-span-2" />
            <Select label="Layout" name="layout" options={POPUP_LAYOUTS} defaultValue={initial.layout} className="sm:col-span-2" />
            {kind === "event" && (
              <Select label="Masterclass / event" name="eventId" defaultValue={initial.eventId} className="sm:col-span-2"
                options={[["", events.length ? "Choose…" : "No events yet — create one in Masterclasses"], ...events.map((e) => [e.id, e.label] as [string, string])]}
                hint="Title, flyer, date, price, seats, deadline and the registration link come from the event itself." />
            )}
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Content</legend>
            {kind === "event" && <p className="text-xs text-muted-foreground sm:col-span-2">Leave any field empty to use the event&apos;s own wording.</p>}
            <Field label="Small label above the heading" name="eyebrow" defaultValue={initial.eyebrow} placeholder={kind === "event" ? "Live masterclass" : "e.g. New this month"} />
            <Field label="Button text" name="buttonText" defaultValue={initial.buttonText} placeholder={kind === "event" ? "Register now" : kind === "newsletter" ? "Subscribe" : "Learn more"} />
            <Field label="Heading" name="heading" defaultValue={initial.heading} className="sm:col-span-2" maxLength={140} />
            <TextArea label="Description" name="body" defaultValue={initial.body} rows={3} className="sm:col-span-2" maxLength={600} />
            {kind !== "event" && kind !== "newsletter" && (
              <Field label="Button goes to" name="destination" defaultValue={initial.destination} className="sm:col-span-2" placeholder="/services or https://…" hint="A page on your site (starting with /) or a full https:// link, e.g. a free resource." />
            )}
            <div className="sm:col-span-2">
              <MediaPicker name="imageMediaId" label={kind === "event" ? "Flyer or image (optional — the event flyer is used otherwise)" : "Flyer or image"} defaultId={initial.imageMediaId} onChange={refresh} />
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">Colours <span className="font-normal text-muted-foreground">(empty = your brand colours)</span></legend>
            <Field label="Button colour" name="accent" defaultValue={initial.accent} placeholder="#8c2350" pattern="#[0-9a-fA-F]{6}" />
            <Field label="Background" name="background" defaultValue={initial.background} placeholder="#fbf8f4" pattern="#[0-9a-fA-F]{6}" />
            <Field label="Text" name="text" defaultValue={initial.text} placeholder="#1d1a17" pattern="#[0-9a-fA-F]{6}" />
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">When and where it shows</legend>
            <Select label="Pages" name="pages" defaultValue={initial.pages} onChange={(e) => setPages(e.target.value)} options={[["all", "All public pages"], ["home", "Homepage only"], ["selected", "Selected pages"]]} />
            <Select label="Devices" name="devices" defaultValue={initial.devices} options={[["all", "Desktop and mobile"], ["desktop", "Desktop only"], ["mobile", "Mobile only"]]} />
            {pages === "selected" && <TextArea label="Pages (one per line)" name="pagePaths" defaultValue={initial.pagePaths} rows={3} className="sm:col-span-2" hint="e.g. /about — add * for a whole section, e.g. /insights/*" />}
            <Field label="Delay after the page opens (seconds)" name="delaySeconds" type="number" min={0} max={120} defaultValue={initial.delaySeconds} />
            <Field label="Priority (higher wins)" name="priority" type="number" min={-100} max={100} defaultValue={initial.priority} hint="Only one pop-up shows at a time." />
            <Select label="How often" name="frequency" defaultValue={initial.frequency} className="sm:col-span-2" options={[
              ["dismiss_period", "Once per visit, then pause after it is closed"],
              ["session", "Once per visit"],
              ["every_page", "On every page until it is closed"],
            ]} />
            <Field label="After closing, hide for (days)" name="dismissDays" type="number" min={0} max={365} defaultValue={initial.dismissDays} />
            <Field label="Start showing (optional)" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} />
            <Field label="Stop showing (optional)" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} />
          </fieldset>
          <div className="flex items-center gap-3"><Submit className="shrink-0 whitespace-nowrap">{initial.id ? "Save changes" : "Save as draft"}</Submit><span className="text-xs text-muted-foreground">Saving never publishes — use Publish when you&apos;re happy with the preview.</span></div>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Preview</p>
            <div className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Preview device">
              {(Object.keys(FRAMES) as (keyof typeof FRAMES)[]).map((d) => (
                <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d}
                  className={`rounded-md px-3 py-1 text-xs ${device === d ? "bg-foreground text-background" : "text-muted-foreground"}`}>{FRAMES[d].label}</button>
              ))}
            </div>
          </div>
          <Frame device={device} theme={theme}>
            {preview.popup ? <PopupView key={`${preview.popup.layout}:${device}`} popup={preview.popup} mode="preview" onClose={() => {}} onCta={() => {}} /> : null}
          </Frame>
          {preview.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{preview.note}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Exactly what visitors see, using live event details. Phones show it as a sheet from the bottom of the screen.</p>
        </div>
      </div>
    </ActionForm>
  );
}
