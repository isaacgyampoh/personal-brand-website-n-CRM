import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function PageTitle({ title, description, actions, back }: { title: string; description?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-1 inline-block text-sm text-muted-foreground hover:text-foreground">← {back.label}</Link>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function LinkButton({ href, children, variant = "default", size = "default", className, ...rest }: { href: string; children: React.ReactNode; variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"; size?: "default" | "sm" | "lg" | "xs"; className?: string; target?: string }) {
  // API routes (exports, downloads, OAuth redirects) must be plain links: next/link would
  // prefetch them on render, generating files and audit entries nobody asked for.
  if (href.startsWith("/api/")) {
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    return <a href={href} className={cn(buttonVariants({ variant, size }), className)} {...rest}>{children}</a>;
  }
  return <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...rest}>{children}</Link>;
}

export function Panel({ title, description, actions, children, className }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-background", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, trend }: { label: string; value: React.ReactNode; hint?: string; trend?: number | null }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {trend !== undefined && trend !== null && (
          <span className={cn("mr-1 font-medium", trend >= 0 ? "text-emerald-600" : "text-red-600")}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}%</span>
        )}
        {hint}
      </p>
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  gray: "bg-muted text-muted-foreground ring-border",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  paid: "green", confirmed: "green", published: "green", success: "green", completed: "green", active: "green", subscribed: "green",
  approved: "green", accepted: "green", processed: "green", delivered: "green", converted: "green", won: "green",
  pending: "amber", pending_payment: "amber", reserved: "amber", scheduled: "blue", draft: "gray", initialized: "amber",
  processing: "amber", queued: "blue", running: "blue", sending: "blue", open: "blue",
  failed: "red", cancelled: "red", expired: "gray", refunded: "violet", partially_refunded: "violet", needs_attention: "red",
  dead: "red", rejected: "red", no_show: "red", archived: "gray", unsubscribed: "gray", suppressed: "gray", revoked: "red", lost: "gray",
};

export function StatusBadge({ status, tone }: { status: string; tone?: keyof typeof TONES }) {
  const t = TONES[tone ?? STATUS_TONE[status] ?? "gray"];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset", t)}>{status.replace(/_/g, " ")}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-background px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-background", className)}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "blue" | "red" | "green"; children: React.ReactNode }) {
  const map = { amber: "border-amber-300 bg-amber-50 text-amber-900", blue: "border-sky-300 bg-sky-50 text-sky-900", red: "border-red-300 bg-red-50 text-red-900", green: "border-emerald-300 bg-emerald-50 text-emerald-900" };
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", map[tone])}>{children}</div>;
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-4 flex justify-between text-sm">
      {page > 1 ? <Link className="text-muted-foreground hover:text-foreground" href={`${base}${sep}page=${page - 1}`}>← Previous</Link> : <span />}
      {hasMore && <Link className="text-muted-foreground hover:text-foreground" href={`${base}${sep}page=${page + 1}`}>Next →</Link>}
    </div>
  );
}
