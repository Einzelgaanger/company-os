// Escalation urgency scoring.
//
// Ordering a person's escalation queue is a decision that affects who gets
// helped first, so the score is deterministic and inspectable rather than a
// model judgement. The model is only allowed to rephrase the rationale for
// display; it never moves an item up or down the queue.
//
// Score is 0-100, composed of five independent pressures. Each has a hard cap
// so no single factor can dominate.

export type UrgencyBand = "critical" | "high" | "medium" | "low";

export type UrgencyInput = {
  createdAt: string;
  dueBy: string | null;
  slaHours: number;
  commitmentPriority: string | null;
  commitmentDueDate: string | null;
  repeatCount: number;
  /** Other open commitments blocked by this one. */
  dependentCount: number;
  projectHealth: string | null;
  sensitivity: string | null;
  acknowledged: boolean;
};

export type UrgencyResult = {
  score: number;
  band: UrgencyBand;
  rationale: string;
  factors: Array<{ label: string; points: number }>;
};

const MAX = {
  sla: 45,
  priority: 20,
  overdue: 15,
  repeat: 10,
  blast: 10,
};

const PRIORITY_POINTS: Record<string, number> = {
  critical: MAX.priority,
  high: 14,
  medium: 8,
  low: 4,
};

function hoursBetween(from: number, to: number): number {
  return (to - from) / 3_600_000;
}

function daysSince(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function scoreUrgency(input: UrgencyInput, now: number = Date.now()): UrgencyResult {
  const factors: Array<{ label: string; points: number }> = [];

  // 1. SLA pressure. Dominant factor: an escalation past its SLA is the whole
  // reason the escalation ladder exists.
  const created = new Date(input.createdAt).getTime();
  const due = input.dueBy
    ? new Date(input.dueBy).getTime()
    : created + input.slaHours * 3_600_000;
  let slaPoints: number;
  if (now >= due) {
    const hoursOver = hoursBetween(due, now);
    slaPoints = Math.min(MAX.sla, 30 + hoursOver * 1.5);
    factors.push({
      label:
        hoursOver < 1
          ? "SLA just breached"
          : `${Math.round(hoursOver)}h past SLA`,
      points: slaPoints,
    });
  } else {
    const total = Math.max(1, hoursBetween(created, due));
    const elapsed = Math.max(0, hoursBetween(created, now));
    slaPoints = Math.min(28, (elapsed / total) * 28);
    const hoursLeft = Math.round(hoursBetween(now, due));
    factors.push({ label: `${hoursLeft}h until SLA`, points: slaPoints });
  }

  // 2. What the underlying commitment is worth.
  const priority = (input.commitmentPriority ?? "medium").toLowerCase();
  const priorityPoints = PRIORITY_POINTS[priority] ?? 8;
  factors.push({ label: `${priority} priority`, points: priorityPoints });

  // 3. How late the actual deliverable is, independent of the escalation clock.
  let overduePoints = 0;
  if (input.commitmentDueDate) {
    const overdueDays = daysSince(input.commitmentDueDate);
    if (overdueDays > 0) {
      overduePoints = Math.min(MAX.overdue, overdueDays * 1.5);
      factors.push({ label: `${overdueDays}d overdue`, points: overduePoints });
    }
  }

  // 4. Escalating the same commitment repeatedly means the ladder is not working.
  let repeatPoints = 0;
  if (input.repeatCount > 1) {
    repeatPoints = Math.min(MAX.repeat, (input.repeatCount - 1) * 5);
    factors.push({ label: `escalated ${input.repeatCount}x`, points: repeatPoints });
  }

  // 5. Blast radius: work stuck behind this, and the health of its project.
  let blastPoints = 0;
  if (input.dependentCount > 0) {
    blastPoints += Math.min(6, input.dependentCount * 2);
    factors.push({
      label: `${input.dependentCount} item${input.dependentCount === 1 ? "" : "s"} blocked behind it`,
      points: Math.min(6, input.dependentCount * 2),
    });
  }
  if (input.projectHealth === "off_track") {
    blastPoints += 4;
    factors.push({ label: "project off track", points: 4 });
  } else if (input.projectHealth === "at_risk") {
    blastPoints += 2;
    factors.push({ label: "project at risk", points: 2 });
  }
  blastPoints = Math.min(MAX.blast, blastPoints);

  let score = slaPoints + priorityPoints + overduePoints + repeatPoints + blastPoints;

  // Acknowledged means somebody has picked it up; it stays in the queue but
  // stops competing with untouched items.
  if (input.acknowledged) {
    score *= 0.7;
    factors.push({ label: "acknowledged", points: 0 });
  }

  score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));

  return {
    score,
    band: bandFor(score),
    rationale: buildRationale(factors),
    factors: factors.sort((a, b) => b.points - a.points),
  };
}

export function bandFor(score: number): UrgencyBand {
  if (score >= 72) return "critical";
  if (score >= 48) return "high";
  if (score >= 24) return "medium";
  return "low";
}

/** The two heaviest factors, as a phrase a manager can act on. */
function buildRationale(factors: Array<{ label: string; points: number }>): string {
  const top = [...factors]
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((f) => f.label);
  if (!top.length) return "Within SLA, no aggravating factors.";
  return top.join(", ");
}
