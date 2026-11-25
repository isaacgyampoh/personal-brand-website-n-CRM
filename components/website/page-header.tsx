import { Emphasis } from "./emphasis";

export function PageHeader({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <header className="site-container pb-14 pt-10 md:pb-20 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          {eyebrow && <p className="eyebrow eyebrow-rule">{eyebrow}</p>}
          <h1 className="display-xl mt-6"><Emphasis text={title} /></h1>
        </div>
        {(intro || children) && (
          <div className="lg:col-span-4">
            {intro && <p className="lede">{intro}</p>}
            {children}
          </div>
        )}
      </div>
      <hr className="rule mt-14 md:mt-20" />
    </header>
  );
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="site-container pb-28">
      <div className="max-w-xl border-l-2 border-[var(--brand-accent)] py-2 pl-6">
        <p className="display-sm">{title}</p>
        {body && <p className="mt-3 text-[var(--muted-ink)]">{body}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
