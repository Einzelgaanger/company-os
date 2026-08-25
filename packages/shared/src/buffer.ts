/**
 * B6 project buffers and the fever chart — 04_FLOW_ENGINE.md §4.7.
 *
 * Critical-chain's answer to schedule uncertainty: stop defending every task
 * date, aggregate the protection into one project buffer, and watch buffer
 * consumption against chain completion. Right for Loop because it warns
 * earlier than a percentage, it is about the **project** rather than a person,
 * and it degrades to `unknown` rather than to a misleading green.
 *
 * Writes to `projects.buffer_days`, `buffer_method`, `buffer_consumed_days`,
 * `chain_complete_pct` and `fever_zone` — the columns B1 added in
 * `0005`'s predecessor, `0004_flow.sql`.
 *
 * Spans arrive as working days. This module does no calendar arithmetic: the
 * caller runs `workingSecondsBetween` so there is exactly one implementation
 * of what a working day is (§4.4).
 */

import { codWeight, type CostOfDelayBand } from "./costOfDelay.js";
import type { FlowState } from "./flow.js";

/** Mirrors `projects.buffer_method`. */
export type BufferMethod = "explicit" | "observed_waiting" | "classical" | "unknown";

/** Mirrors `projects.fever_zone`. */
export type FeverZone = "green" | "amber" | "red" | "unknown";

/** Below this the chart is a guess with a ruler on it (§4.7). */
export const MIN_COMMITMENTS_FOR_FEVER = 3;

/** §4.7 — the derived buffer is floored and capped as a share of the remaining span. */
const OBSERVED_FLOOR = 0.15;
const OBSERVED_CAP = 0.5;
/** The textbook fraction, used only when there is nothing observed to use. */
const CLASSICAL_FRACTION = 0.5;
/** Consumption above this is red regardless of how complete the chain is. */
const ABSOLUTE_RED_PCT = 90;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type BufferSizingInput = {
  /** Set by an admin at `/projects/:id/settings`. Wins outright when present. */
  explicitBufferDays?: number | null;
  /** Working days from now to `target_end_date`; null when there is no target. */
  remainingWorkingDays: number | null;
  /** Working days from `start_date` to `target_end_date`. */
  spanWorkingDays: number | null;
  /** This project's own aggregate waiting over the last 30 days, in working days. */
  observedWaitingWorkingDays30d: number | null;
  /** Working days in the observation window, so the rate can be annualized to the span. */
  observationWorkingDays?: number;
};

export type BufferSizing = {
  bufferDays: number | null;
  method: BufferMethod;
  /** Shown in the UI beside the number — §4.7 requires the method be visible. */
  explanation: string;
};

/**
 * §4.7 buffer sizing. Prefers the project's own observed waiting over the
 * classical 50% rule, because a buffer derived from this project's actual
 * behaviour is far more credible to the person reading it.
 */
export function sizeBuffer(input: BufferSizingInput): BufferSizing {
  if (input.explicitBufferDays != null && input.explicitBufferDays > 0) {
    return {
      bufferDays: round2(input.explicitBufferDays),
      method: "explicit",
      explanation: "Set by the project owner.",
    };
  }

  const remaining = input.remainingWorkingDays;
  if (remaining == null || remaining <= 0) {
    return {
      bufferDays: null,
      method: "unknown",
      explanation: "No target end date, so there is no span to protect.",
    };
  }

  const observed = input.observedWaitingWorkingDays30d;
  const window = input.observationWorkingDays ?? 22;
  if (observed != null && observed > 0 && window > 0) {
    const projected = (observed / window) * remaining;
    const floor = remaining * OBSERVED_FLOOR;
    const cap = remaining * OBSERVED_CAP;
    const bufferDays = round2(Math.min(Math.max(projected, floor), cap));
    return {
      bufferDays,
      method: "observed_waiting",
      explanation: `From this project's own waiting over the last 30 days, scaled to the ${round2(
        remaining,
      )} working days remaining.`,
    };
  }

  const span = input.spanWorkingDays;
  if (span == null || span <= 0) {
    return {
      bufferDays: null,
      method: "unknown",
      explanation: "No start date and nothing observed yet.",
    };
  }

  return {
    bufferDays: round2(span * CLASSICAL_FRACTION),
    method: "classical",
    explanation: "The classical 50% rule — nothing observed on this project yet.",
  };
}

export type ChainCommitment = {
  id: string;
  flowState: FlowState;
  costOfDelayBand: CostOfDelayBand;
  /**
   * The owner's last self-reported completion, 0–1. Used only while waiting,
   * so that waiting can hold completion where it was but never advance it.
   */
  lastSelfReported?: number | null;
};

/** §4.7. `review` counts as half done, not as waiting, despite being a waiting state for flow. */
function completionOf(c: ChainCommitment): number {
  switch (c.flowState) {
    case "done":
      return 1;
    case "proposed":
    case "ready":
      return 0;
    case "active":
    case "review":
      return 0.5;
    default:
      // Every waiting_* state. Waiting never increases completion — that is the
      // whole point of the chart.
      return Math.min(Math.max(c.lastSelfReported ?? 0, 0), 1);
  }
}

/** §4.7 — completion weighted by cost-of-delay band across non-cancelled items. */
export function chainCompletePct(commitments: readonly ChainCommitment[]): number {
  let weighted = 0;
  let total = 0;
  for (const c of commitments) {
    if (c.flowState === "cancelled") continue;
    const weight = codWeight(c.costOfDelayBand);
    weighted += weight * completionOf(c);
    total += weight;
  }
  return total === 0 ? 0 : round2((weighted / total) * 100);
}

export type FeverInput = {
  bufferDays: number | null;
  /**
   * Working days of aggregate waiting on the project's `critical` and `high`
   * band items. Computed by the caller from the waiting register.
   */
  bufferConsumedDays: number;
  chainCompletePct: number;
  commitmentCount: number;
  hasTargetEndDate: boolean;
};

export type FeverReading = {
  zone: FeverZone;
  bufferConsumedPct: number;
  chainCompletePct: number;
  /** Plain-language line shown under the chart. Never a colour alone (§7.4). */
  caption: string;
};

/**
 * §4.7 zones: green below chain completion, amber between 1× and 1.5×, red
 * above 1.5× or above 90% regardless. `unknown` says "not enough signal yet"
 * rather than showing a green nobody should trust.
 */
export function feverReading(input: FeverInput): FeverReading {
  const chain = round2(Math.min(Math.max(input.chainCompletePct, 0), 100));

  if (
    input.commitmentCount < MIN_COMMITMENTS_FOR_FEVER ||
    !input.hasTargetEndDate ||
    input.bufferDays == null ||
    input.bufferDays <= 0
  ) {
    return {
      zone: "unknown",
      bufferConsumedPct: 0,
      chainCompletePct: chain,
      caption: "Not enough signal yet — this needs a target end date and at least 3 commitments.",
    };
  }

  const consumed = round2(Math.min((input.bufferConsumedDays / input.bufferDays) * 100, 999));

  if (consumed >= ABSOLUTE_RED_PCT) {
    return {
      zone: "red",
      bufferConsumedPct: consumed,
      chainCompletePct: chain,
      caption: `${consumed}% of the buffer is gone. The end date is at risk whatever the chain says.`,
    };
  }

  if (consumed <= chain) {
    return {
      zone: "green",
      bufferConsumedPct: consumed,
      chainCompletePct: chain,
      caption: `Buffer is being spent slower than the chain is completing (${consumed}% vs ${chain}%).`,
    };
  }

  if (chain > 0 && consumed <= chain * 1.5) {
    return {
      zone: "amber",
      bufferConsumedPct: consumed,
      chainCompletePct: chain,
      caption: `Buffer is running ahead of progress (${consumed}% spent, ${chain}% complete). Worth a look at what is waiting.`,
    };
  }

  return {
    zone: "red",
    bufferConsumedPct: consumed,
    chainCompletePct: chain,
    caption: `Buffer is running well ahead of progress (${consumed}% spent, ${chain}% complete).`,
  };
}
