import type { NextConfig } from "next";

/**
 * Cache Components is intentionally disabled. Admin and portal routes are
 * request-time by nature; published public content is cached with
 * `unstable_cache` + tags and invalidated on publish (see lib/cache.ts), so
 * publishing never requires a redeploy.
 */
const nextConfig: NextConfig = {
  cacheComponents: false,
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "sharp", "nodemailer", "exceljs"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: common },
      {
        source: "/(admin|portal|studio|login|register|account)(.*)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
