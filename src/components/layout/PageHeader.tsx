import type { ReactNode } from "react";

/** Portal page header — §26 exact composition */
export function PageHeader({
  title,
  description,
  subtitle,
  actions,
}: {
  title: string;
  description?: string;
  /** Alias for description (§7.1 uses subtitle) */
  subtitle?: string;
  actions?: ReactNode;
}) {
  const sub = description ?? subtitle;
  return (
    <header className="page-hero flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2.5">
          {/* Lime tick: 4×16 capsule */}
          <span className="mt-1.5 h-4 w-1 shrink-0 rounded-full bg-[#D3F36B]" aria-hidden />
          <h1
            className="font-display min-w-0 text-base font-bold leading-tight tracking-tight text-white sm:text-lg line-clamp-2"
            title={title}
          >
            {title}
          </h1>
        </div>
        {sub && (
          <p className="mt-1 max-w-3xl pl-3.5 text-xs font-medium leading-snug text-white/65">{sub}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-3.5 sm:pl-0">{actions}</div>
      )}
    </header>
  );
}
