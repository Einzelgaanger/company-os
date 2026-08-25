import { cn } from "@/lib/utils";

/**
 * Loop mark — continuity open-ring + lime “next action” node (top-right).
 * Product glyph only. Not IOUX’s U. Shell: forest tile rx≈10 + lime accent.
 *
 * One sentence: “An open loop that still has a next beat.”
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
      <LoopGlyph />
    </svg>
  );
}

/** Glyph only — when a forest `.brand-tile` / CSS plate already paints the background. */
export function NavBrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-7 w-7 shrink-0", className)} aria-hidden>
      <LoopGlyph />
    </svg>
  );
}

function LoopGlyph() {
  return (
    <>
      {/* Open continuity ring — gap at top-right */}
      <path
        d="M29.2 14.2A9.2 9.2 0 1 0 20.2 29.4"
        fill="none"
        stroke="#F3FAF5"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* Inner whisper arc — denser ops feel at larger sizes */}
      <path
        d="M26.4 16.4A6.2 6.2 0 1 0 20.2 26.4"
        fill="none"
        stroke="#F3FAF5"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Next-action node — rhymes with CTA lime node, not IOUX U */}
      <circle cx="29.4" cy="12.6" r="3.45" fill="#D3F36B" />
    </>
  );
}

/** @deprecated Prefer BrandMark — alias for existing imports */
export const LoopMark = BrandMark;
