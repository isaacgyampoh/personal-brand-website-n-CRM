"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useState } from "react";
import { MediaDialog } from "@/components/dashboard/media-picker";

/** Tiptap editor producing JSON (rendered later by the whitelist renderer). */
export function RichEditor({ value, onChange, placeholder = "Start writing…" }: { value: unknown; onChange: (doc: unknown) => void; placeholder?: string }) {
  const [media, setMedia] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["https", "mailto", "tel"], HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image,
    ],
    content: (value as object) ?? { type: "doc", content: [] },
    editorProps: { attributes: { class: "prose-site min-h-[50vh] px-5 py-4 outline-none [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:underline [&_img]:my-4", "aria-label": placeholder, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  });
  if (!editor) return <div className="min-h-[50vh] rounded-lg border" />;
  const b = (active: boolean) => `h-8 min-w-8 rounded px-2 text-sm ${active ? "bg-foreground text-background" : "hover:bg-muted"}`;
  return (
    <div className="rounded-lg border bg-background">
      <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b bg-background p-1.5" role="toolbar" aria-label="Formatting">
        <button type="button" className={b(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={b(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <button type="button" className={`${b(editor.isActive("bold"))} font-bold`} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">B</button>
        <button type="button" className={`${b(editor.isActive("italic"))} italic`} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">I</button>
        <button type="button" className={b(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
        <button type="button" className={b(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
        <button type="button" className={b(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
        <button type="button" className={b(editor.isActive("link"))} onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL (https://…, /page, mailto:)", prev ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else if (/^(https:\/\/|\/|mailto:|tel:)/.test(url)) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          else alert("Links must start with https://, / or mailto:");
        }}>Link</button>
        <button type="button" className={b(false)} onClick={() => setMedia(true)}>Image</button>
        <button type="button" className={b(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</button>
        <span className="ml-auto flex gap-1">
          <button type="button" className={b(false)} onClick={() => editor.chain().focus().undo().run()} aria-label="Undo">↶</button>
          <button type="button" className={b(false)} onClick={() => editor.chain().focus().redo().run()} aria-label="Redo">↷</button>
        </span>
      </div>
      <EditorContent editor={editor} />
      <MediaDialog open={media} onClose={() => setMedia(false)} onSelect={(m) => { if (m.url) editor.chain().focus().setImage({ src: m.url, alt: m.alt ?? "" }).run(); setMedia(false); }} />
    </div>
  );
}
