/**
 * Progress & health — 08_REPORTING.md §8.2
 * Pure functions. Never invent progress from elapsed time.
 */

export type CommitmentStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "at_risk"
  | "overdue"
  | "escalated"
  | "done"
  | "cancelled"
  | "not_started";

export type Priority = "low" | "medium" | "high" | "critical";

export type ProjectHealth = "on_track" | "at_risk" | "off_track" | "unknown";

export type CommitmentProgressInput = {
  status: CommitmentStatus;
  progressPct: number | null;
  reviewRequired?: boolean;
};

export type MilestoneInput = {
  status: "open" | "in_progress" | "done" | "cancelled";
  weight: number;
  commitmentIds: string[];
};

const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Status-derived % when nothing self-reported. Cancelled excluded by callers. */
export function statusImpliedProgress(status: CommitmentStatus): number {
  switch (status) {
    case "done":
      return 100;
    case "in_progress":
    case "blocked":
    case "at_risk":
    case "overdue":
    case "escalated":
      return 50;
    case "open":
    case "not_started":
    default:
      return 0;
  }
}

/**
 * Commitment progress: self-reported preferred, else status-derived.
 * Never elapsed-time inference.
 */
export function commitmentProgress(c: CommitmentProgressInput): {
  pct: number;
  source: "self_reported" | "status_derived" | "excluded";
} {
  if (c.status === "cancelled" || c.reviewRequired) {
    return { pct: 0, source: "excluded" };
  }
  if (c.progressPct != null && !Number.isNaN(c.progressPct)) {
    return { pct: Math.min(100, Math.max(0, c.progressPct)), source: "self_reported" };
  }
  return { pct: statusImpliedProgress(c.status), source: "status_derived" };
}

export type ProjectCommitmentInput = CommitmentProgressInput & {
  id: string;
  priority: Priority;
  milestoneId?: string | null;
  dueDate?: string | null;
  targetEndDate?: string | null;
};

/**
 * Project progress with optional milestones (§8.2).
 * Returns lowConfidence when >40% of weight is status-derived.
 */
export function projectProgress(
  commitments: ProjectCommitmentInput[],
  milestones: MilestoneInput[] = []
): { pct: number; lowConfidence: boolean; method: "milestones" | "priority_weighted" } {
  const active = commitments.filter((c) => c.status !== "cancelled" && !c.reviewRequired);

  if (milestones.length > 0) {
    let num = 0;
    let den = 0;
    let derivedWeight = 0;
    let totalWeight = 0;

    for (const m of milestones) {
      if (m.status === "cancelled") continue;
      const w = m.weight > 0 ? m.weight : 1;
      den += w;
      totalWeight += w;

      let completion = 0;
      if (m.status === "done") {
        completion = 1;
      } else {
        const kids = active.filter((c) => m.commitmentIds.includes(c.id));
        if (kids.length > 0) {
          let sum = 0;
          let derived = 0;
          for (const c of kids) {
            const r = commitmentProgress(c);
            sum += r.pct;
            if (r.source === "status_derived") derived += 1;
          }
          completion = sum / kids.length / 100;
          derivedWeight += w * (derived / kids.length);
        } else if (m.status === "in_progress") {
          completion = 0.5;
          derivedWeight += w;
        }
      }
      num += w * completion;
    }

    const pct = den === 0 ? 0 : Math.round((num / den) * 10000) / 100;
    return {
      pct,
      lowConfidence: totalWeight > 0 && derivedWeight / totalWeight > 0.4,
      method: "milestones",
    };
  }

  let num = 0;
  let den = 0;
  let derivedW = 0;
  for (const c of active) {
    const w = PRIORITY_WEIGHT[c.priority] ?? 2;
    const r = commitmentProgress(c);
    num += w * r.pct;
    den += w;
    if (r.source === "status_derived") derivedW += w;
  }
  const pct = den === 0 ? 0 : Math.round((num / den) * 100) / 100;
  return {
    pct,
    lowConfidence: den > 0 && derivedW / den > 0.4,
    method: "priority_weighted",
  };
}

/**
 * Project health (§8.2). Recompute on status change / nightly.
 */
export function projectHealth(
  commitments: Array<{
    status: CommitmentStatus;
    priority: Priority;
    reviewRequired?: boolean;
  }>,
  opts?: { targetEndDate?: string | null; progressPct?: number; lastActivityAt?: string | null }
): ProjectHealth {
  const active = commitments.filter((c) => c.status !== "cancelled" && !c.reviewRequired);
  if (active.length < 2) return "unknown";

  const overdue = active.filter((c) => c.status === "overdue" || c.status === "escalated");
  const overduePct = overdue.length / active.length;
  const criticalOverdue = overdue.some((c) => c.priority === "critical");
  if (criticalOverdue || overduePct > 0.25) return "off_track";

  const blocked = active.some((c) => c.status === "blocked" || c.status === "escalated");
  if (blocked || overduePct > 0.1) return "at_risk";

  if (opts?.targetEndDate && opts.progressPct != null) {
    const end = new Date(opts.targetEndDate);
    const days = (end.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days <= 14 && opts.progressPct < 70) return "at_risk";
  }

  if (opts?.lastActivityAt) {
    const age = Date.now() - new Date(opts.lastActivityAt).getTime();
    if (age > 14 * 24 * 60 * 60 * 1000) return "unknown";
  }

  return "on_track";
}

/** Display helper for low-confidence figures */
export function formatProgressLabel(pct: number, lowConfidence: boolean): string {
  if (lowConfidence) return `~${Math.round(pct)}% (limited recent updates)`;
  return `${Math.round(pct)}%`;
}
