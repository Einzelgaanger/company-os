import { StatusChip } from "./StatusChip";
import { formatWorkingDays, type FlowState } from "@/lib/flow";
import { cn } from "@/lib/utils";

/**
 * WaitingTime — 07_DESIGN_SYSTEM §7.6. The product's signature number, in one
 * component, because it appears on /flow, /waiting, every commitment and the
 * report and must be identical in all four.
 *
 * Rules encoded here rather than left to callers:
 *  - always working days, with the unit stated every time
 *  - under one day says when it started; a fraction of a day is false precision
 *  - the colour only crosses to amber and red at the thresholds, because a
 *    component that is orange from minute one teaches people to ignore orange
 */

/**
 * Amber and red thresholds in working days. B4 reads these from the tenant's
 * coordination mode; until then `mutual_adjustment`'s values are the default.
 */
export const WAITING_AMBER_DAYS = 3;
export const WAITING_RED_DAYS = 7;

export function waitingSeverity(workingDays: number): "calm" | "amber" | "red" {
  if (workingDays >= WAITING_RED_DAYS) return "red";
  if (workingDays >= WAITING_AMBER_DAYS) return "amber";
  return "calm";
}

/**
 * Status tokens only — the duration is a status reading, so it never borrows a
 * brand colour. Calm stays brand ink because calm is the absence of a signal.
 */
const DURATION_TONE = {
  calm: "text-brand-ink",
  amber: "text-status-waiting-ink",
  red: "text-status-attention-ink",
} as const;

export function WaitingTime({
  state,
  workingDays,
  holderLabel,
  className,
}: {
  state: FlowState;
  workingDays: number;
  /** Who holds it — a team or role where possible, never "because of X". */
  holderLabel?: string | null;
  className?: string;
}) {
  const severity = waitingSeverity(workingDays);
  return (
    <div className={cn("space-y-1", className)}>
      <StatusChip state={state} attention={severity === "red"} />
      <div className={cn("font-mono text-sm font-medium", DURATION_TONE[severity])}>
        {formatWorkingDays(workingDays)}
      </div>
      {holderLabel && (
        <div className="text-[11px] font-medium text-[#5A6B7D]">on {holderLabel}</div>
      )}
    </div>
  );
}

/** Inline variant for table rows, where the chip lives in its own column. */
export function WaitingDuration({
  workingDays,
  className,
}: {
  workingDays: number;
  className?: string;
}) {
  const severity = waitingSeverity(workingDays);
  return (
    <span className={cn("font-mono text-xs font-medium", DURATION_TONE[severity], className)}>
      {formatWorkingDays(workingDays)}
    </span>
  );
}
