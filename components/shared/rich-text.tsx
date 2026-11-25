import { Fragment, type ReactNode } from "react";
import type { RichNode } from "@/features/content/domain/rich-text";

/**
 * Whitelist renderer for Tiptap JSON. Unknown nodes are skipped, links are
 * restricted to safe schemes, and all text is escaped by React.
 */
const safeHref = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^(https:\/\/|http:\/\/localhost|\/(?!\/)|mailto:|tel:|#)/.test(s) ? s : null;
};
const safeSrc = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^(https:\/\/|\/(?!\/))/.test(s) ? s : null;
};

function renderMarks(text: string, marks: RichNode["marks"] = []): ReactNode {
  return marks.reduce<ReactNode>((node, mark) => {
    switch (mark.type) {
      case "bold": return <strong>{node}</strong>;
      case "italic": return <em>{node}</em>;
      case "underline": return <u>{node}</u>;
      case "strike": return <s>{node}</s>;
      case "code": return <code className="rounded bg-black/5 px-1 py-0.5 text-[0.9em]">{node}</code>;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (!href) return node;
        const external = href.startsWith("http");
        return <a href={href} className="underline decoration-1 underline-offset-4 hover:text-[var(--brand-accent)]" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{node}</a>;
      }
      default: return node;
    }
  }, text);
}

function renderNode(node: RichNode, key: number): ReactNode {
  const children = node.content?.map((c, i) => renderNode(c, i));
  switch (node.type) {
    case "doc": return <Fragment key={key}>{children}</Fragment>;
    case "paragraph": return <p key={key}>{children}</p>;
    case "text": return <Fragment key={key}>{renderMarks(node.text ?? "", node.marks)}</Fragment>;
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 2), 4);
      const cls = level === 2 ? "display-sm mt-12 mb-4" : "mt-8 mb-3 text-lg font-semibold";
      return level === 2 ? <h2 key={key} className={cls}>{children}</h2> : level === 3 ? <h3 key={key} className={cls}>{children}</h3> : <h4 key={key} className={cls}>{children}</h4>;
    }
    case "bulletList": return <ul key={key} className="my-5 list-disc space-y-2 pl-6">{children}</ul>;
    case "orderedList": return <ol key={key} className="my-5 list-decimal space-y-2 pl-6">{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key} className="my-8 border-l-2 border-[var(--brand-accent)] pl-6 font-display text-[1.5rem] leading-snug italic">{children}</blockquote>;
    case "horizontalRule": return <hr key={key} className="rule my-10" />;
    case "hardBreak": return <br key={key} />;
    case "codeBlock": return <pre key={key} className="my-6 overflow-x-auto bg-black/5 p-4 text-sm"><code>{children}</code></pre>;
    case "image": {
      const src = safeSrc(node.attrs?.src);
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <figure key={key} className="my-10"><img src={src} alt={String(node.attrs?.alt ?? "")} loading="lazy" decoding="async" className="w-full" /></figure>;
    }
    default: return null;
  }
}

export function RichText({ doc, className = "prose-site" }: { doc: unknown; className?: string }) {
  if (!doc || typeof doc !== "object" || (doc as RichNode).type !== "doc") return null;
  const content = (doc as RichNode).content ?? [];
  if (!content.length) return null;
  return <div className={className}>{content.map((n, i) => renderNode(n, i))}</div>;
}

export function hasRichContent(doc: unknown): boolean {
  return Boolean(doc && typeof doc === "object" && ((doc as RichNode).content?.length ?? 0) > 0);
}
