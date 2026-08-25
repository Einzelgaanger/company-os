/**
 * Flow engine reads — 04_FLOW_ENGINE.md §4.2, §4.3, §4.8, §4.9.
 *
 * Pure functions over a set of commitments and their `flow_events`. The store
 * decides where the rows come from (Postgres or the memory demo plane); the
 * arithmetic lives here so `/flow/summary`, `/flow/aging` and `/waiting` cannot
 * drift from each other or from the report.
 *
 * Durations are always working seconds via `workingSecondsBetween` (§4.4).
 * Nothing here derives a duration by subtracting two timestamps.
 */

import {
  codWeight,
  type CostOfDelayBand,
  type CostOfDelayBandSource,
} from "./costOfDelay.js";
import {
  toWorkingDays,
  workingSecondsBetween,
  type TenantTimeSettings,
} from "./workingTime.js";

/** §4.2. Exactly one at all times; every transition is a `flow_events` row. */
export type FlowState =
  | "proposed"
  | "ready"
  | "active"
  | "waiting_internal"
  | "waiting_external"
  | "waiting_decision"
  | "waiting_dependency"
  | "review"
  | "done"
  | "cancelled";

export const FLOW_STATES: readonly FlowState[] = [
  "proposed",
  "ready",
  "active",
  "waiting_internal",
  "waiting_external",
  "waiting_decision",
  "waiting_dependency",
  "review",
  "done",
  "cancelled",
];

/** §4.2 — the states whose clock counts toward waiting. `review` is one of them. */
export const WAITING_STATES: readonly FlowState[] = [
  "waiting_internal",
  "waiting_external",
  "waiting_decision",
  "waiting_dependency",
  "review",
];

/** The four waiting flavours route differently (§4.2), so they filter separately. */
export type WaitingKind = "internal" | "external" | "decision" | "dependency" | "review";

const WAITING_KIND: Partial<Record<FlowState, WaitingKind>> = {
  waiting_internal: "internal",
  waiting_external: "external",
  waiting_decision: "decision",
  waiting_dependency: "dependency",
  review: "review",
};

export function isFlowState(value: unknown): value is FlowState {
  return typeof value === "string" && (FLOW_STATES as readonly string[]).includes(value);
}

export function isWaitingState(state: FlowState): boolean {
  return (WAITING_STATES as readonly string[]).includes(state);
}

/** Everything except `done` and `cancelled`; `cancelled` is excluded from all metrics. */
export function isOpenState(state: FlowState): boolean {
  return state !== "done" && state !== "cancelled";
}

export function waitingKindOf(state: FlowState): WaitingKind | null {
  return WAITING_KIND[state] ?? null;
}

export type FlowCommitment = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  ownerUserId: string | null;
  flowState: FlowState;
  /** Start of the current state's clock. */
  flowStateSince: string;
  /** Start of queue age. Falls back to createdAt when the item never queued. */
  firstReadyAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  waitingOnUserId: string | null;
  waitingOnExternalName: string | null;
  /**
   * Display name for whoever holds it — a team or role where possible, a person
   * only when the person is the right point of contact (§7.6). Resolved by the
   * store, which is the layer that knows the roster.
   */
  waitingOnLabel: string | null;
  costOfDelayBand: CostOfDelayBand;
  costOfDelayBandSource: CostOfDelayBandSource;
  /** Open items in `waiting_dependency` on this one; drives §4.5 promotion. */
  blockedItemCount: number;
  committedDate: string | null;
  needsLook: boolean;
};

export type FlowEvent = {
  commitmentId: string;
  fromState: FlowState | null;
  toState: FlowState;
  createdAt: string;
};

export type FlowInput = {
  commitments: readonly FlowCommitment[];
  events: readonly FlowEvent[];
  settings: TenantTimeSettings;
  now?: Date | string | number;
};

const WEEK_MS = 7 * 86_400_000;

function instant(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function byCommitment(events: readonly FlowEvent[]): Map<string, FlowEvent[]> {
  const map = new Map<string, FlowEvent[]>();
  for (const e of events) {
    const list = map.get(e.commitmentId);
    if (list) list.push(e);
    else map.set(e.commitmentId, [e]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => instant(a.createdAt) - instant(b.createdAt));
  }
  return map;
}

/**
 * The state a commitment was in at `at`, and when it entered that state.
 * Reconstructed from the event log rather than the `flow_state` cache, because
 * the cache only knows the present (§4.2).
 */
export function stateAt(
  events: readonly FlowEvent[],
  at: Date | string | number,
): { state: FlowState; since: string } | null {
  const ts = instant(at);
  let found: FlowEvent | null = null;
  for (const e of events) {
    if (instant(e.createdAt) <= ts) found = e;
    else break;
  }
  return found ? { state: found.toState, since: found.createdAt } : null;
}

/**
 * §4.9 Waiting now — working days across every item in a waiting state at `at`,
 * expressed in team-days. The headline number: how much of the organization's
 * time is sitting still.
 */
export function waitingTeamDaysAt(input: FlowInput, at: Date | string | number): {
  teamDays: number;
  itemCount: number;
} {
  const events = byCommitment(input.events);
  const ts = instant(at);
  let seconds = 0;
  let itemCount = 0;

  for (const c of input.commitments) {
    const history = events.get(c.id);
    const snapshot = history
      ? stateAt(history, ts)
      : instant(c.flowStateSince) <= ts
        ? { state: c.flowState, since: c.flowStateSince }
        : null;
    if (!snapshot || !isWaitingState(snapshot.state)) continue;
    itemCount += 1;
    seconds += workingSecondsBetween(snapshot.since, ts, input.settings);
  }

  return { teamDays: round1(toWorkingDays(seconds, input.settings)), itemCount };
}

export type WaitingRow = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  flowState: FlowState;
  waitingKind: WaitingKind;
  holderKey: string;
  holderLabel: string;
  holderUserId: string | null;
  since: string;
  workingSeconds: number;
  workingDays: number;
  costOfDelayBand: CostOfDelayBand;
  /** cod_weight × working seconds — the register's ordering key (§4.5). */
  costScore: number;
  needsLook: boolean;
};

export type WaitingGroup = {
  key: string;
  label: string;
  itemCount: number;
  workingDays: number;
  itemIds: string[];
};

export type WaitingRegister = {
  items: WaitingRow[];
  totals: { itemCount: number; teamDays: number };
  byHolder: WaitingGroup[];
  byProject: WaitingGroup[];
};

const UNASSIGNED_HOLDER = "Unassigned";

/**
 * §4.3 The waiting register — every item currently waiting, and who holds it,
 * ordered by cost of delay × age.
 */
export function waitingRegister(input: FlowInput): WaitingRegister {
  const now = input.now ?? Date.now();
  const rows: WaitingRow[] = [];

  for (const c of input.commitments) {
    const kind = waitingKindOf(c.flowState);
    if (!kind) continue;
    const workingSeconds = workingSecondsBetween(c.flowStateSince, now, input.settings);
    const holderLabel =
      c.waitingOnLabel ?? c.waitingOnExternalName ?? UNASSIGNED_HOLDER;
    rows.push({
      id: c.id,
      title: c.title,
      projectId: c.projectId,
      projectName: c.projectName,
      flowState: c.flowState,
      waitingKind: kind,
      holderKey: c.waitingOnUserId ?? holderLabel,
      holderLabel,
      holderUserId: c.waitingOnUserId,
      since: c.flowStateSince,
      workingSeconds,
      workingDays: round1(toWorkingDays(workingSeconds, input.settings)),
      costOfDelayBand: c.costOfDelayBand,
      costScore: codWeight(c.costOfDelayBand) * workingSeconds,
      needsLook: c.needsLook,
    });
  }

  rows.sort((a, b) => b.costScore - a.costScore);

  const group = (
    keyOf: (row: WaitingRow) => string,
    labelOf: (row: WaitingRow) => string,
  ): WaitingGroup[] => {
    const map = new Map<string, WaitingGroup>();
    for (const row of rows) {
      const key = keyOf(row);
      let g = map.get(key);
      if (!g) {
        g = { key, label: labelOf(row), itemCount: 0, workingDays: 0, itemIds: [] };
        map.set(key, g);
      }
      g.itemCount += 1;
      g.workingDays = round1(g.workingDays + row.workingDays);
      g.itemIds.push(row.id);
    }
    // §7.4: aligned bars, sorted descending by total waiting days.
    return [...map.values()].sort((a, b) => b.workingDays - a.workingDays);
  };

  const totalSeconds = rows.reduce((sum, r) => sum + r.workingSeconds, 0);

  return {
    items: rows,
    totals: {
      itemCount: rows.length,
      teamDays: round1(toWorkingDays(totalSeconds, input.settings)),
    },
    byHolder: group(
      (r) => r.holderKey,
      (r) => r.holderLabel,
    ),
    byProject: group(
      (r) => r.projectId ?? "none",
      (r) => r.projectName ?? "No project",
    ),
  };
}

export type AgingPoint = {
  id: string;
  title: string;
  projectName: string | null;
  flowState: FlowState;
  costOfDelayBand: CostOfDelayBand;
  /** x axis — working days in queue since the item first became ready. */
  queueAgeDays: number;
};

export type AgingWip = {
  items: AgingPoint[];
  /** Percentiles of historical working days at completion; null until 5 samples. */
  percentiles: { p50: number; p85: number; p95: number } | null;
  sampleSize: number;
};

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Fewer samples than this and a percentile line is a guess with a ruler on it. */
const MIN_PERCENTILE_SAMPLE = 5;

/**
 * §4.8 Aging work-in-progress — one dot per open item, x = queue age in working
 * days, y = cost-of-delay band, with percentile lines from historical age at
 * completion. Replaces the four count cards because it shows the distribution,
 * and the outliers are what needs action.
 */
export function agingWip(input: FlowInput): AgingWip {
  const now = input.now ?? Date.now();
  const items: AgingPoint[] = [];
  const completed: number[] = [];

  for (const c of input.commitments) {
    const queueStart = c.firstReadyAt ?? c.createdAt;

    if (c.flowState === "done" && c.resolvedAt) {
      completed.push(
        toWorkingDays(
          workingSecondsBetween(queueStart, c.resolvedAt, input.settings),
          input.settings,
        ),
      );
      continue;
    }

    // `proposed` is not counted (§4.2) — it has no queue clock yet.
    if (!isOpenState(c.flowState) || c.flowState === "proposed") continue;

    items.push({
      id: c.id,
      title: c.title,
      projectName: c.projectName,
      flowState: c.flowState,
      costOfDelayBand: c.costOfDelayBand,
      queueAgeDays: round1(
        toWorkingDays(
          workingSecondsBetween(queueStart, now, input.settings),
          input.settings,
        ),
      ),
    });
  }

  items.sort((a, b) => b.queueAgeDays - a.queueAgeDays);
  completed.sort((a, b) => a - b);

  return {
    items,
    percentiles:
      completed.length >= MIN_PERCENTILE_SAMPLE
        ? {
            p50: round1(percentile(completed, 0.5)),
            p85: round1(percentile(completed, 0.85)),
            p95: round1(percentile(completed, 0.95)),
          }
        : null,
    sampleSize: completed.length,
  };
}

export type FlowSummary = {
  waitingNow: { teamDays: number; itemCount: number };
  longestWait: {
    commitmentId: string;
    title: string;
    workingDays: number;
    holderLabel: string;
  } | null;
  flowDebt: {
    teamDays: number;
    previousTeamDays: number;
    deltaDays: number;
    direction: "up" | "down" | "flat";
  };
  unblockedThisWeek: number;
  /** 12 weekly points ending now, for the header sparkline (§7.7). */
  trend: Array<{ at: string; teamDays: number }>;
  wip: { openCount: number; limit: number | null; exceeded: boolean };
};

export type FlowSummaryInput = FlowInput & {
  /** Optional advisory limit from /settings/organization. Never enforcement (§4.8). */
  wipLimit?: number | null;
  trendWeeks?: number;
};

/** §4.9 — the four metrics that replace Open / At risk / Overdue / Escalated. */
export function flowSummary(input: FlowSummaryInput): FlowSummary {
  const now = input.now ?? Date.now();
  const nowTs = instant(now);
  const trendWeeks = input.trendWeeks ?? 12;

  const current = waitingTeamDaysAt(input, nowTs);
  const previous = waitingTeamDaysAt(input, nowTs - WEEK_MS);

  const register = waitingRegister({ ...input, now: nowTs });
  const oldest = [...register.items].sort((a, b) => b.workingSeconds - a.workingSeconds)[0];

  let unblockedThisWeek = 0;
  for (const e of input.events) {
    if (instant(e.createdAt) < nowTs - WEEK_MS) continue;
    if (e.fromState && isWaitingState(e.fromState) && !isWaitingState(e.toState)) {
      unblockedThisWeek += 1;
    }
  }

  const trend: Array<{ at: string; teamDays: number }> = [];
  for (let i = trendWeeks - 1; i >= 0; i -= 1) {
    const at = nowTs - i * WEEK_MS;
    trend.push({
      at: new Date(at).toISOString(),
      teamDays: waitingTeamDaysAt(input, at).teamDays,
    });
  }

  const openCount = input.commitments.filter(
    (c) => isOpenState(c.flowState) && c.flowState !== "proposed",
  ).length;
  const limit = input.wipLimit ?? null;

  const deltaDays = round1(current.teamDays - previous.teamDays);

  return {
    waitingNow: current,
    longestWait: oldest
      ? {
          commitmentId: oldest.id,
          title: oldest.title,
          workingDays: oldest.workingDays,
          holderLabel: oldest.holderLabel,
        }
      : null,
    flowDebt: {
      teamDays: current.teamDays,
      previousTeamDays: previous.teamDays,
      deltaDays,
      direction: deltaDays > 0 ? "up" : deltaDays < 0 ? "down" : "flat",
    },
    unblockedThisWeek,
    trend,
    wip: {
      openCount,
      limit,
      exceeded: limit != null && openCount > limit,
    },
  };
}

export type FlowTimelineSegment = {
  state: FlowState;
  from: string;
  to: string;
  workingSeconds: number;
  workingDays: number;
  kind: "waiting" | "working" | "other";
};

export type CommitmentFlowTimeline = {
  commitmentId: string;
  flowState: FlowState;
  flowStateSince: string;
  waitingSeconds: number;
  waitingDays: number;
  workingSeconds: number;
  workingDays: number;
  segments: FlowTimelineSegment[];
  /** One-line summary for the detail page header. */
  summary: string;
};

/**
 * §8.6 / B1 exit — per-item flow timeline: N days waiting, M hours working.
 * Reconstructs segments from `flow_events`; durations always via working time.
 */
export function commitmentFlowTimeline(input: {
  commitmentId: string;
  flowState: FlowState;
  flowStateSince: string;
  events: readonly FlowEvent[];
  settings: TenantTimeSettings;
  now?: Date | string | number;
}): CommitmentFlowTimeline {
  const now = input.now ?? Date.now();
  const nowIso = new Date(instant(now)).toISOString();
  const events = input.events
    .filter((e) => e.commitmentId === input.commitmentId)
    .slice()
    .sort((a, b) => instant(a.createdAt) - instant(b.createdAt));

  const segments: FlowTimelineSegment[] = [];
  let waitingSeconds = 0;
  let workingSeconds = 0;

  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]!;
    const end = i + 1 < events.length ? events[i + 1]!.createdAt : nowIso;
    const secs = workingSecondsBetween(e.createdAt, end, input.settings);
    const kind: FlowTimelineSegment["kind"] = isWaitingState(e.toState)
      ? "waiting"
      : e.toState === "active"
        ? "working"
        : "other";
    if (kind === "waiting") waitingSeconds += secs;
    if (kind === "working") workingSeconds += secs;
    segments.push({
      state: e.toState,
      from: e.createdAt,
      to: end,
      workingSeconds: secs,
      workingDays: round1(toWorkingDays(secs, input.settings)),
      kind,
    });
  }

  if (events.length === 0) {
    const secs = workingSecondsBetween(input.flowStateSince, now, input.settings);
    const kind: FlowTimelineSegment["kind"] = isWaitingState(input.flowState)
      ? "waiting"
      : input.flowState === "active"
        ? "working"
        : "other";
    if (kind === "waiting") waitingSeconds = secs;
    if (kind === "working") workingSeconds = secs;
    segments.push({
      state: input.flowState,
      from: input.flowStateSince,
      to: nowIso,
      workingSeconds: secs,
      workingDays: round1(toWorkingDays(secs, input.settings)),
      kind,
    });
  }

  const waitingDays = round1(toWorkingDays(waitingSeconds, input.settings));
  const workingDays = round1(toWorkingDays(workingSeconds, input.settings));
  const workingHours = Math.round((workingSeconds / 3600) * 10) / 10;

  return {
    commitmentId: input.commitmentId,
    flowState: input.flowState,
    flowStateSince: input.flowStateSince,
    waitingSeconds,
    waitingDays,
    workingSeconds,
    workingDays,
    segments,
    summary: `${waitingDays} working day${waitingDays === 1 ? "" : "s"} waiting · ${workingHours} hour${workingHours === 1 ? "" : "s"} working`,
  };
}
