import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { loadSettings } from "@/features/settings/application/settings";

/**
 * Cache tags for published public content. Admin mutations call
 * `invalidate(...)`, so the public site reflects publishes immediately
 * without redeploying. Only call these from within the Next.js runtime.
 */
export const TAGS = {
  settings: "settings",
  pages: "pages",
  articles: "articles",
  services: "services",
  events: "events",
  courses: "courses",
  products: "products",
  proof: "proof", // testimonials, case studies, media
} as const;

export const getPublicSettings = unstable_cache(() => loadSettings(), ["settings:v1"], {
  tags: [TAGS.settings],
  revalidate: 3600,
});

export function invalidate(...tags: (keyof typeof TAGS)[]) {
  for (const t of tags) revalidateTag(TAGS[t], { expire: 0 });
}
