/**
 * Cost of delay — 04_FLOW_ENGINE.md §4.5.
 *
 * Loop cannot compute a true cost of delay; that needs business context it does
 * not have. It does the thing that captures most of the value: four bands, set
 * by a human, applied consistently.
 *
 * A band is never produced by a model. An invented economic weight is worse than
 * an honest default, so the only sources are 'default', 'project' (inherited) and
 * 'manual' (a manager's override).
 */

export type CostOfDelayBand = "critical" | "high" | "standard" | "low";

export type CostOfDelayBandSource = "default" | "project" | "manual";

/** Highest first. Also the display order. */
export const COST_OF_DELAY_BANDS: readonly CostOfDelayBand[] = [
  "critical",
  "high",
  "standard",
  "low",
];

export const COST_OF_DELAY_WEIGHT: Record<CostOfDelayBand, number> = {
  critical: 8,
  high: 4,
  standard: 2,
  low: 1,
};

export const DEFAULT_COST_OF_DELAY_BAND: CostOfDelayBand = "standard";

const BAND_LABEL: Record<CostOfDelayBand, string> = {
  critical: "Critical",
  high: "High",
  standard: "Standard",
  low: "Low",
};

export function isCostOfDelayBand(value: unknown): value is CostOfDelayBand {
  return typeof value === "string" && value in COST_OF_DELAY_WEIGHT;
}

/** Mirrors the SQL cod_weight(); unknown input falls back to the default band. */
export function codWeight(band: string | null | undefined): number {
  return isCostOfDelayBand(band)
    ? COST_OF_DELAY_WEIGHT[band]
    : COST_OF_DELAY_WEIGHT[DEFAULT_COST_OF_DELAY_BAND];
}

export function costOfDelayLabel(band: CostOfDelayBand): string {
  return BAND_LABEL[band];
}

/** One band up. `critical` is the ceiling. */
export function promoteBand(band: CostOfDelayBand): CostOfDelayBand {
  const i = COST_OF_DELAY_BANDS.indexOf(band);
  return i <= 0 ? "critical" : (COST_OF_DELAY_BANDS[i - 1] as CostOfDelayBand);
}

export type CostOfDelayInput = {
  /** The commitment's own band, meaningful only when its source is 'manual'. */
  commitmentBand?: CostOfDelayBand | null;
  commitmentBandSource?: CostOfDelayBandSource | null;
  /** The parent project's band, inherited when there is no override. */
  projectBand?: CostOfDelayBand | null;
  /**
   * Open commitments in `waiting_dependency` on this one. The single derived
   * signal in §4.5: blocking other people is a real cost.
   */
  blockedItemCount?: number;
};

export type ResolvedCostOfDelay = {
  band: CostOfDelayBand;
  weight: number;
  /** Where the pre-promotion band came from. */
  source: CostOfDelayBandSource;
  /** The band before dependency promotion. */
  baseBand: CostOfDelayBand;
  promoted: boolean;
  /** UI copy for the promotion, e.g. "raised to High — 3 items are waiting on this". */
  reason: string | null;
};

/**
 * Resolve the band actually used for ordering: manual override beats inherited
 * project band beats the default, then one automatic promotion while other items
 * are blocked on this one.
 */
export function resolveCostOfDelayBand(input: CostOfDelayInput = {}): ResolvedCostOfDelay {
  let source: CostOfDelayBandSource;
  let baseBand: CostOfDelayBand;

  if (input.commitmentBandSource === "manual" && isCostOfDelayBand(input.commitmentBand)) {
    source = "manual";
    baseBand = input.commitmentBand;
  } else if (isCostOfDelayBand(input.projectBand)) {
    source = "project";
    baseBand = input.projectBand;
  } else if (isCostOfDelayBand(input.commitmentBand)) {
    source = input.commitmentBandSource ?? "default";
    baseBand = input.commitmentBand;
  } else {
    source = "default";
    baseBand = DEFAULT_COST_OF_DELAY_BAND;
  }

  const blocked = Math.max(0, Math.trunc(input.blockedItemCount ?? 0));
  if (blocked === 0 || baseBand === "critical") {
    return {
      band: baseBand,
      weight: COST_OF_DELAY_WEIGHT[baseBand],
      source,
      baseBand,
      promoted: false,
      reason: null,
    };
  }

  const band = promoteBand(baseBand);
  return {
    band,
    weight: COST_OF_DELAY_WEIGHT[band],
    source,
    baseBand,
    promoted: true,
    reason: `raised to ${costOfDelayLabel(band)} — ${blocked} ${
      blocked === 1 ? "item is" : "items are"
    } waiting on this`,
  };
}

/**
 * Ordering key for the waiting register, the needs-attention list, the check-in
 * cap and escalations (§4.5). Working seconds only — never wall time.
 */
export function costOfDelayScore(
  band: CostOfDelayBand | null | undefined,
  workingSeconds: number,
): number {
  return codWeight(band) * Math.max(0, workingSeconds);
}

/** Descending by score, for Array.prototype.sort. */
export function compareByCostOfDelay(
  a: { costOfDelayBand?: CostOfDelayBand | null; workingSeconds: number },
  b: { costOfDelayBand?: CostOfDelayBand | null; workingSeconds: number },
): number {
  return (
    costOfDelayScore(b.costOfDelayBand, b.workingSeconds) -
    costOfDelayScore(a.costOfDelayBand, a.workingSeconds)
  );
}
