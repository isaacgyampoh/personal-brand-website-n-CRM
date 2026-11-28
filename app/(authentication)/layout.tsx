import { themeCss as themeCssFor } from "@/lib/theme";
import "../site.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "@/lib/cache";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  const css = themeCssFor(s.theme, ":root");
  return (
    <div className="site grid min-h-dvh lg:grid-cols-2">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <aside className="tone-ink relative hidden flex-col justify-between p-12 lg:flex">
        <Link href="/" className="font-display text-3xl">{s.brand.name}</Link>
        <p className="display-md max-w-md">{s.brand.tagline || "Your programmes, bookings and resources — in one place."}</p>
        <p className="text-xs opacity-60">© {new Date().getFullYear()} {s.brand.name}</p>
      </aside>
      <main className="flex flex-col px-6 py-10 sm:px-12">
        <Link href="/" className="font-display text-2xl lg:hidden">{s.brand.name}</Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}

// Rendered per request; published content comes from the tagged data cache (lib/cache.ts).
export const dynamic = "force-dynamic";
