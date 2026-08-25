import {
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  Pause,
  Play,
  Triangle,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FLOW_STATE_LABEL, type FlowState } from "@/lib/flow";
import { STATUS_TOKEN_BY_FLOW_STATE, type StatusToken } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/**
 * StatusChip — the only way to render a flow state (07_DESIGN_SYSTEM §7.3).
 *
 * It always emits the triad: colour, icon, text label. Colour alone is never
 * sufficient, including in compact table cells, so the icon and label are not
 * optional and there is no icon-only variant on purpose.
 *
 * Colour comes exclusively from the status set — the blue → orange axis, with
 * green reserved for `done` and red for the critical tier. Brand colours (forest,
 * lime) never appear here: a chip that borrowed the brand accent would make the
 * logo look like an alarm. `pnpm check:tokens` enforces the separation.
 */
const TOKEN_CLASS: Record<StatusToken, string> = {
  moving: "bg-status-moving-tint text-status-moving-ink",
  ready: "bg-status-ready-tint text-status-ready-ink",
  waiting: "bg-status-waiting-tint text-status-waiting-ink",
  review: "bg-status-review-tint text-status-review-ink",
  attention: "bg-status-attention-tint text-status-attention-ink",
  done: "bg-status-done-tint text-status-done-ink",
};

const ICON: Record<FlowState, LucideIcon> = {
  proposed: CircleDashed,
  ready: Circle,
  active: Play,
  waiting_internal: Pause,
  waiting_external: Pause,
  waiting_decision: Pause,
  waiting_dependency: Pause,
  review: CircleDot,
  done: Check,
  cancelled: X,
};

export function StatusChip({
  state,
  /** Waiting past the red threshold reads as needs-attention, not as waiting. */
  attention = false,
  className,
}: {
  state: FlowState;
  attention?: boolean;
  className?: string;
}) {
  const token: StatusToken = attention ? "attention" : STATUS_TOKEN_BY_FLOW_STATE[state];
  const Icon = attention ? Triangle : ICON[state];
  const label = attention ? "Needs attention" : FLOW_STATE_LABEL[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        TOKEN_CLASS[token],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
