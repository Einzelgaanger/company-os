import { COST_OF_DELAY_LABEL, type CostOfDelayBand } from "@/lib/flow";
import { cn } from "@/lib/utils";

/**
 * CostOfDelayBadge — 04_FLOW_ENGINE §4.5. Four bands, set by a human, never
 * inferred by a model. The auto-promotion reason is shown on hover, because a
 * band that changed itself has to explain why ("raised to High — 3 items are
 * waiting on this").
 */
const BAND: Record<CostOfDelayBand, string> = {
  critical: "bg-status-attention-tint text-status-attention-ink border-status-attention",
  high: "bg-status-waiting-tint text-status-waiting-ink border-status-waiting",
  standard: "bg-status-ready-tint text-status-ready-ink border-status-ready",
  low: "bg-[#F7FAF6] text-status-ready-ink border-[rgba(14,31,26,0.1)]",
};

export function CostOfDelayBadge({
  band,
  promotionReason,
  className,
}: {
  band: CostOfDelayBand;
  promotionReason?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        BAND[band],
        className,
      )}
      title={promotionReason ?? `Cost of delay — ${COST_OF_DELAY_LABEL[band]}`}
    >
      {COST_OF_DELAY_LABEL[band]}
      {promotionReason && <span aria-hidden>↑</span>}
    </span>
  );
}
