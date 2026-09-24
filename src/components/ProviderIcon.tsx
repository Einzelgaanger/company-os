import { useState } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-7 w-7 p-[3px]",
  md: "h-9 w-9 p-1.5",
  lg: "h-11 w-11 p-2",
} as const;

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[1][0]}`;
}

/**
 * Brand mark for a connector, vendored under public/integrations by
 * scripts/gen/provider-icons.mjs. Falls back to a lettermark for connectors
 * whose logo is not redistributable.
 */
export function ProviderIcon({
  id,
  name,
  mark,
  size = "md",
  className,
}: {
  id: string;
  name: string;
  /** The catalog's Iconify reference. Empty means lettermark. */
  mark: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showMark = Boolean(mark) && !failed;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-[rgba(14,31,26,0.1)] bg-white",
        SIZES[size],
        className,
      )}
    >
      {showMark ? (
        <img
          src={`${import.meta.env.BASE_URL}integrations/${id}.svg`}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-mono text-[11px] font-bold uppercase leading-none text-[#5B6560]">
          {initials(name)}
        </span>
      )}
    </span>
  );
}
