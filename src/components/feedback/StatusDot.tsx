import { cn } from "@/lib/utils";
import type { Health } from "@/lib/db";

const COLORS: Record<Health, string> = {
  green: "bg-lime",
  amber: "bg-gold",
  red: "bg-red",
  grey: "bg-[rgba(90,107,125,0.35)]",
};

const LABELS: Record<Health, string> = {
  green: "On track",
  amber: "At risk",
  red: "Needs attention",
  grey: "No activity",
};

/**
 * Status dot always ships with a text label — color is never the sole signal
 * (colorblind-safe requirement, Section 11 / 14).
 */
export function StatusDot({
  health,
  label,
  className,
}: {
  health: Health;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("h-2.5 w-2.5 rounded-full", COLORS[health])} aria-hidden />
      <span className="text-sm text-slate">{label ?? LABELS[health]}</span>
    </span>
  );
}
