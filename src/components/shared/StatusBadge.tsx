import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "pending" | "danger" | "neutral" | "info" | "pipeline";

const TONE: Record<StatusTone, string> = {
  ok: "bg-mint text-forest-hover",
  pending: "bg-status-waiting-tint text-status-waiting-ink",
  danger: "bg-status-attention-tint text-status-attention-ink",
  neutral: "bg-soft text-slate",
  info: "bg-status-moving-tint text-status-moving-ink",
  pipeline: "bg-soft text-forest",
};

/** Soft pastel mono uppercase badge — §9.2 */
export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
