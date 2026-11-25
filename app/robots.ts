import type { MetadataRoute } from "next";
import { loadSetting } from "@/features/settings/application/settings";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const seo = await loadSetting("seo");
  const indexable = seo.indexable && process.env.NODE_ENV === "production";
  return {
    rules: indexable
      ? { userAgent: "*", allow: "/", disallow: ["/admin", "/portal", "/api", "/login", "/register", "/checkout", "/book/manage", "/feedback", "/go/"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: indexable ? `${base}/sitemap.xml` : undefined,
  };
}
