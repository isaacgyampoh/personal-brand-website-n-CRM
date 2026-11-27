"use client";

import type { Config, Field } from "@puckeditor/core";
import { useState } from "react";
import { blockSchemas, type BlockType } from "../domain/blocks";
import * as S from "@/components/website/blocks-static";
import { MediaDialog } from "@/components/dashboard/media-picker";

/* ----- field helpers ----- */
const text = (label: string): Field => ({ type: "text", label });
const area = (label: string): Field => ({ type: "textarea", label });
const num = (label: string, min = 1, max = 12): Field => ({ type: "number", label, min, max });
const toggle = (label: string): Field => ({ type: "radio", label, options: [{ label: "Yes", value: true }, { label: "No", value: false }] });
const select = (label: string, opts: [string, string][]): Field => ({ type: "select", label, options: opts.map(([value, l]) => ({ value, label: l })) });
const tone: Field = select("Background", [["paper", "Paper"], ["surface", "White"], ["ink", "Dark"], ["accent", "Accent colour"]]);
const cta = (label: string): Field => ({ type: "object", label, objectFields: { label: text("Button text"), href: text("Link (e.g. /book or https://…)") } });

function ImageFieldInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-24 w-full rounded border object-cover" />
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded border px-2 py-1 text-xs">{value ? "Change image" : "Choose image"}</button>
        {value && <button type="button" onClick={() => onChange("")} className="text-xs text-neutral-500">Remove</button>}
      </div>
      <MediaDialog open={open} onClose={() => setOpen(false)} onSelect={(m) => { onChange(m.url ?? ""); setOpen(false); }} />
    </div>
  );
}
const image = (label: string): Field => ({ type: "custom", label, render: ({ value, onChange }) => <ImageFieldInput value={(value as string) ?? ""} onChange={onChange} /> });

const defaults = (t: BlockType) => blockSchemas[t].parse({ headline: "Your headline", heading: "", statement: "" }) as Record<string, unknown>;

function LivePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="site-container section-y-sm">
      <div className="border border-dashed border-[var(--line)] p-10 text-center">
        <p className="eyebrow">Live section</p>
        <p className="display-sm mt-3">{title}</p>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">{note}</p>
      </div>
    </div>
  );
}

/* ----- config ----- */
export function buildPuckConfig(rootClassName: string, themeCss: string): Config {
  const C = (type: BlockType, label: string, fields: Record<string, Field>, render: (p: never) => React.ReactNode) => ({
    label,
    fields: { ...fields, hidden: toggle("Hide this section on the website") },
    defaultProps: { ...defaults(type), hidden: false },
    render: ((p: { hidden?: boolean }) => (p.hidden
      ? <div style={{ opacity: 0.35 }} title="Hidden on the website">{(render as (q: unknown) => React.ReactNode)(p)}</div>
      : (render as (q: unknown) => React.ReactNode)(p))) as never,
  });
  return {
    root: {
      fields: {},
      render: ({ children }: { children: React.ReactNode }) => (
        <div className={`site ${rootClassName}`}>
          <style dangerouslySetInnerHTML={{ __html: themeCss }} />
          {children}
        </div>
      ),
    },
    categories: {
      headers: { title: "Openers", components: ["Hero", "Statement"] },
      story: { title: "Story & text", components: ["Profile", "Introduction", "EditorialText", "ImageText", "Timeline"] },
      offers: { title: "Offers (live data)", components: ["Services", "Events", "Courses", "BookingCard", "Pricing"] },
      proof: { title: "Proof", components: ["Testimonials", "Stats", "Logos", "Speaking"] },
      media: { title: "Media", components: ["Gallery", "Video"] },
      convert: { title: "Conversion", components: ["CallToAction", "Newsletter", "Assessment", "Faq", "Articles"] },
      layout: { title: "Layout", components: ["Spacer"] },
    },
    components: {
      Hero: C("Hero", "Hero", {
        variant: select("Layout", [["editorial", "Editorial split (portrait)"], ["statement", "Typographic statement"], ["portrait-full", "Full-bleed portrait"]]),
        eyebrow: text("Eyebrow"), headline: area("Headline (wrap words in *asterisks* for italics)"), emphasis: text("Highlighted ending (italic)"),
        body: area("Introduction"), primaryCta: cta("Primary button"), secondaryCta: cta("Secondary link"),
        imageUrl: image("Portrait / image"), imageAlt: text("Image description (alt text)"), videoUrl: text("Or video URL (YouTube/Vimeo)"), tone,
      }, (p) => <S.Hero {...(p as object as Parameters<typeof S.Hero>[0])} />),
      Introduction: C("Introduction", "Personal introduction", {
        eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Story (blank line = new paragraph)"), signature: text("Signature"),
        imageUrl: image("Photo"), imageAlt: text("Photo description"), cta: cta("Link"), tone,
      }, (p) => <S.Introduction {...(p as object as Parameters<typeof S.Introduction>[0])} />),
      Statement: C("Statement", "Positioning statement", { statement: area("Statement"), attribution: text("Attribution"), tone }, (p) => <S.Statement {...(p as object as Parameters<typeof S.Statement>[0])} />),
      EditorialText: C("EditorialText", "Editorial text", {
        eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Text"), aside: area("Pull quote / aside"),
        layout: select("Layout", [["single", "Heading left, text right"], ["with-aside", "With pull quote"], ["centered", "Centred"]]), tone,
      }, (p) => <S.EditorialText {...(p as object as Parameters<typeof S.EditorialText>[0])} />),
      ImageText: C("ImageText", "Image & text", {
        eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Text"), imageUrl: image("Image"), imageAlt: text("Image description"),
        imageSide: select("Image side", [["left", "Left"], ["right", "Right"]]), cta: cta("Button"), tone,
      }, (p) => <S.ImageText {...(p as object as Parameters<typeof S.ImageText>[0])} />),
      Services: C("Services", "Services (live)", { eyebrow: text("Eyebrow"), heading: area("Heading"), intro: area("Intro"), source: select("Show", [["featured", "Featured services"], ["all", "All services"]]), limit: num("How many"), cta: cta("Link"), tone },
        () => <LivePlaceholder title="Your services" note="Pulled automatically from Services. Edit them in Admin → Services." />),
      Events: C("Events", "Upcoming masterclasses (live)", { eyebrow: text("Eyebrow"), heading: area("Heading"), intro: area("Intro"), limit: num("How many", 1, 9), cta: cta("Link"), tone },
        () => <LivePlaceholder title="Upcoming masterclasses" note="Shows published upcoming events. Hidden automatically when there are none." />),
      Courses: C("Courses", "Programmes (live)", { eyebrow: text("Eyebrow"), heading: area("Heading"), intro: area("Intro"), limit: num("How many", 1, 9), cta: cta("Link"), tone },
        () => <LivePlaceholder title="Academy programmes" note="Shows published public courses." />),
      Articles: C("Articles", "Featured articles (live)", { eyebrow: text("Eyebrow"), heading: area("Heading"), limit: num("How many", 1, 9), featuredOnly: toggle("Featured only"), cta: cta("Link"), tone },
        () => <LivePlaceholder title="Latest insights" note="Shows your published articles." />),
      Testimonials: C("Testimonials", "Testimonials (live)", { eyebrow: text("Eyebrow"), heading: area("Heading"), limit: num("How many"), featuredOnly: toggle("Featured only"), tone },
        () => <LivePlaceholder title="Client testimonials" note="Only approved testimonials with recorded consent are shown. Hidden if there are none." />),
      Stats: C("Stats", "Achievements / numbers", {
        eyebrow: text("Eyebrow"), heading: area("Heading"),
        items: { type: "array", label: "Figures (only real, verifiable numbers)", arrayFields: { value: text("Figure"), label: text("Label"), note: text("Note") }, getItemSummary: (i: { value?: string; label?: string }) => `${i.value ?? ""} ${i.label ?? ""}`, max: 6 }, tone,
      }, (p) => <S.Stats {...(p as object as Parameters<typeof S.Stats>[0])} />),
      Logos: C("Logos", "Trusted by (logos)", {
        heading: text("Heading"),
        items: { type: "array", label: "Organisations (with permission)", arrayFields: { name: text("Name"), logoUrl: image("Logo"), href: text("Link") }, getItemSummary: (i: { name?: string }) => i.name || "Organisation", max: 16 }, tone,
      }, (p) => <S.Logos {...(p as object as Parameters<typeof S.Logos>[0])} />),
      Timeline: C("Timeline", "Career journey", {
        eyebrow: text("Eyebrow"), heading: area("Heading"),
        items: { type: "array", label: "Milestones", arrayFields: { year: text("Year"), title: text("Title"), body: area("Detail") }, getItemSummary: (i: { year?: string; title?: string }) => `${i.year ?? ""} ${i.title ?? ""}` }, tone,
      }, (p) => <S.Timeline {...(p as object as Parameters<typeof S.Timeline>[0])} />),
      Speaking: C("Speaking", "Speaking highlights", {
        eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Text"),
        items: { type: "array", label: "Engagements", arrayFields: { title: text("Event / talk"), detail: text("Detail") }, getItemSummary: (i: { title?: string }) => i.title || "Engagement" }, cta: cta("Button"), tone,
      }, (p) => <S.Speaking {...(p as object as Parameters<typeof S.Speaking>[0])} />),
      Gallery: C("Gallery", "Photo gallery", {
        heading: text("Heading"), layout: select("Layout", [["mosaic", "Mosaic"], ["row", "Scrolling row"]]),
        images: { type: "array", label: "Images", arrayFields: { url: image("Image"), alt: text("Description"), caption: text("Caption") }, getItemSummary: (i: { caption?: string; alt?: string }) => i.caption || i.alt || "Image" }, tone,
      }, (p) => <S.Gallery {...(p as object as Parameters<typeof S.Gallery>[0])} />),
      Video: C("Video", "Video", { heading: text("Heading"), url: text("YouTube or Vimeo URL"), caption: text("Caption"), tone }, (p) => <S.Video {...(p as object as Parameters<typeof S.Video>[0])} />),
      Faq: C("Faq", "FAQs", {
        eyebrow: text("Eyebrow"), heading: area("Heading"),
        items: { type: "array", label: "Questions", arrayFields: { question: text("Question"), answer: area("Answer") }, getItemSummary: (i: { question?: string }) => i.question || "Question" }, tone,
      }, (p) => <S.Faq {...(p as object as Parameters<typeof S.Faq>[0])} />),
      Pricing: C("Pricing", "Pricing / packages", {
        eyebrow: text("Eyebrow"), heading: area("Heading"), intro: area("Intro"),
        tiers: { type: "array", label: "Packages", max: 4, arrayFields: {
          name: text("Name"), price: text("Price"), period: text("Period"), description: area("Description"),
          features: { type: "array", label: "Features", arrayFields: { text: text("Feature") }, getItemSummary: (i: { text?: string }) => i.text || "Feature" },
          cta: cta("Button"), highlighted: toggle("Highlight"),
        }, getItemSummary: (i: { name?: string }) => i.name || "Package" }, tone,
      }, (p) => <S.Pricing {...(p as object as Parameters<typeof S.Pricing>[0])} />),
      Newsletter: C("Newsletter", "Newsletter sign-up", { eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Text"), buttonLabel: text("Button text"), tone }, (p) => <S.Newsletter {...(p as object as Parameters<typeof S.Newsletter>[0])} />),
      CallToAction: C("CallToAction", "Final call to action", { eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Text"), primaryCta: cta("Primary button"), secondaryCta: cta("Secondary link"), tone }, (p) => <S.CallToAction {...(p as object as Parameters<typeof S.CallToAction>[0])} />),
      BookingCard: C("BookingCard", "Book a service (live)", { heading: text("Heading (optional)"), body: area("Text (optional)"), serviceSlug: text("Service slug (from Admin → Services)"), tone },
        () => <LivePlaceholder title="Booking card" note="Shows the chosen service with a 'Choose a time' button." />),
      Assessment: C("Assessment", "Brand assessment invite", { eyebrow: text("Eyebrow"), heading: area("Heading"), body: area("Text"), assessmentSlug: text("Assessment slug"), cta: cta("Button"), tone }, (p) => <S.Assessment {...(p as object as Parameters<typeof S.Assessment>[0])} />),
      Profile: C("Profile", "Biography (from Business profile)", {
        eyebrow: text("Eyebrow"), heading: area("Heading"), imageUrl: image("Photo"), imageAlt: text("Photo description"),
        showExpertise: toggle("Show areas of expertise"), showQualifications: toggle("Show qualifications"),
        showAchievements: toggle("Show recognition"), showMission: toggle("Show mission & vision"), tone,
      }, () => <LivePlaceholder title="Biography" note="Shows the biography, expertise, qualifications and recognition from Studio → Business profile." />),
      Spacer: C("Spacer", "Spacer / divider", { size: select("Size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]), divider: toggle("Show line") }, (p) => <S.Spacer {...(p as object as Parameters<typeof S.Spacer>[0])} />),
    },
  } as unknown as Config;
}
