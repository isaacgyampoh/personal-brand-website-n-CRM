import Link from "next/link";

export function AnnouncementBar({ text, href }: { text: string; href: string }) {
  const inner = (
    <span className="inline-flex items-center gap-3">
      <span>{text}</span>
      
    </span>
  );
  return (
    <div className="tone-accent text-center text-[0.78rem] font-medium tracking-[0.06em]">
      <div className="site-container py-2.5">
        {href ? <Link href={href} className="underline-offset-4 hover:underline">{inner}</Link> : inner}
      </div>
    </div>
  );
}
