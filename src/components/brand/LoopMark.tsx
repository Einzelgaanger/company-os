import { cn } from "@/lib/utils";

/**
 * Company OS mark — open C ring on forest plate + lime status node.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("h-9 w-9 shrink-0", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect width="40" height="40" rx="10" fill="#0E1F1A" />
      <CompanyOsGlyph />
    </svg>
  );
}

export function NavBrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-7 w-7 shrink-0", className)} aria-hidden>
      <CompanyOsGlyph />
    </svg>
  );
}

function CompanyOsGlyph() {
  return (
    <>
      {/* Open C — company operating system */}
      <path
        d="M28.5 13.2A9.2 9.2 0 1 0 28.5 26.8"
        fill="none"
        stroke="#F4F5F3"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      {/* Inner whisper arc */}
      <path
        d="M26.2 15.4A6.2 6.2 0 1 0 26.2 24.6"
        fill="none"
        stroke="#F4F5F3"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* OS live node */}
      <rect x="26.8" y="17.1" width="5.6" height="5.6" rx="1.5" fill="#D3F36B" />
    </>
  );
}

/** @deprecated Prefer BrandMark */
export const LoopMark = BrandMark;
