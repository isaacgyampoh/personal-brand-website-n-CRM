/**
 * Rich text is stored as Tiptap/ProseMirror JSON and rendered by a
 * whitelist renderer (components/shared/rich-text.tsx). No raw HTML is ever
 * stored or injected.
 */
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};

export const EMPTY_DOC: RichNode = { type: "doc", content: [] };

export function plainText(node: unknown, limit = 200_000): string {
  const out: string[] = [];
  let size = 0;
  const walk = (n: RichNode) => {
    if (size > limit) return;
    if (typeof n.text === "string") {
      out.push(n.text);
      size += n.text.length;
    }
    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
      if (["paragraph", "heading", "listItem", "blockquote"].includes(n.type)) out.push("\n");
    }
  };
  if (node && typeof node === "object") walk(node as RichNode);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
}

export function isRichDoc(v: unknown): v is RichNode {
  return Boolean(v && typeof v === "object" && (v as RichNode).type === "doc");
}

/** Converts plain text (paragraphs separated by blank lines) into a doc. */
export function docFromText(text: string): RichNode {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
}
