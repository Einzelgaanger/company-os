import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/LoopMark";
import { BRAND } from "@/lib/brand";

export function Logo({
  className,
  showWord = true,
  inverted = false,
}: {
  className?: string;
  showWord?: boolean;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className="h-9 w-9" title={BRAND.name} />
      {showWord && (
        <span
          className={cn(
            "font-display text-[20px] font-bold tracking-[-0.03em] sm:text-[22px]",
            inverted ? "text-white" : "text-forest",
          )}
        >
          <span>{BRAND.shortName}</span>
          <span className={cn("ml-1 font-semibold", inverted ? "text-white/70" : "text-forest/55")}>
            OS
          </span>
        </span>
      )}
    </span>
  );
}
