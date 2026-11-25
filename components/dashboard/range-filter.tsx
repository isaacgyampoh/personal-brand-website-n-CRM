import Link from "next/link";
import { cn } from "@/lib/utils";

const OPTIONS = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["mtd", "Month"], ["ytd", "Year"]] as const;

export function RangeFilter({ base, current, from, to }: { base: string; current: string; from?: string; to?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Date range">
        {OPTIONS.map(([k, l]) => (
          <Link key={k} href={`${base}?range=${k}`} aria-current={current === k ? "true" : undefined}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium", current === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{l}</Link>
        ))}
      </div>
      <form className="flex items-center gap-1 text-xs" action={base}>
        <input type="hidden" name="range" value="custom" />
        <label className="sr-only" htmlFor="rf-from">From</label>
        <input id="rf-from" type="date" name="from" defaultValue={from} className="h-8 rounded-md border bg-background px-2" />
        <span aria-hidden>–</span>
        <label className="sr-only" htmlFor="rf-to">To</label>
        <input id="rf-to" type="date" name="to" defaultValue={to} className="h-8 rounded-md border bg-background px-2" />
        <button className="h-8 rounded-md border bg-background px-2 font-medium hover:bg-muted">Apply</button>
      </form>
    </div>
  );
}
