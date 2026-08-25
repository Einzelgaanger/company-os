/**
 * Thin adapter over shared progress logic (mapped to SPA CommitmentStatus).
 * Keep formulas aligned with packages/shared/src/progress.ts.
 */
import type { Commitment } from "@/lib/types";

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function statusPct(status: Commitment["status"]): number {
  switch (status) {
    case "done":
      return 100;
    case "in_progress":
    case "at_risk":
    case "overdue":
    case "escalated":
      return 50;
    default:
      return 0;
  }
}

export function computeProjectProgress(commitments: Commitment[]): {
  pct: number;
  lowConfidence: boolean;
  label: string;
} {
  const eligible = commitments.filter((c) => !c.needs_review);
  let num = 0;
  let den = 0;
  let derived = 0;
  for (const c of eligible) {
    const w = PRIORITY_WEIGHT[c.priority] ?? 2;
    const pct = statusPct(c.status);
    num += w * pct;
    den += w;
    derived += w;
  }
  const pct = den === 0 ? 0 : Math.round((num / den) * 100) / 100;
  const lowConfidence = den > 0 && derived / den > 0.4;
  return {
    pct,
    lowConfidence,
    label: lowConfidence
      ? `~${Math.round(pct)}% (limited recent updates)`
      : `${Math.round(pct)}%`,
  };
}
