import type { Settings } from "@/features/settings/domain/schemas";

const LABELS: Record<keyof Settings["social"], string> = {
  linkedin: "LinkedIn", instagram: "Instagram", x: "X", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook", podcast: "Podcast",
};

export function SocialLinks({ social, className = "" }: { social: Settings["social"]; className?: string }) {
  const entries = (Object.keys(LABELS) as (keyof Settings["social"])[]).filter((k) => social[k]);
  if (!entries.length) return null;
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-2 ${className}`}>
      {entries.map((k) => (
        <li key={k}>
          <a href={social[k]} target="_blank" rel="noopener noreferrer me" className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] opacity-80 hover:opacity-100">
            {LABELS[k]}
          </a>
        </li>
      ))}
    </ul>
  );
}
