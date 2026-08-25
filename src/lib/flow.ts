/**
 * Flow model for the SPA — 04_FLOW_ENGINE.md §4.2–§4.9.
 *
 * Two jobs:
 *  1. The response types for `GET /flow/summary`, `/flow/aging` and `/waiting`,
 *     which the API serves and the pages render unchanged.
 *  2. A read-through for the offline mock data plane, so `/flow` and `/waiting`
 *     work in dev before `VITE_API_URL` is set. The mock plane still carries v2
 *     statuses, so the mapping below mirrors migration 0004's backfill.
 *
 * The API is authoritative. The canonical working-time implementation is
 * `packages/shared/src/workingTime.ts`; `workingSecondsBetween` here is the
 * offline mirror of it, with the tenant_settings defaults baked in, and exists
 * only to serve the mock plane.
 */

import type { Commitment, Project, User } from "./types";

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

export type WaitingKind = "internal" | "external" | "decision" | "dependency" | "review";

export type CostOfDelayBand = "critical" | "high" | "standard" | "low";

export type FlowScope = "self" | "team" | "org";

export const FLOW_STATE_LABEL: Record<FlowState, string> = {
  proposed: "Proposed",
  ready: "Ready",
  active: "Moving",
  waiting_internal: "Waiting — internal",
  waiting_external: "Waiting — external",
  waiting_decision: "Waiting — decision",
  waiting_dependency: "Waiting — dependency",
  review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

export const WAITING_KIND_LABEL: Record<WaitingKind, string> = {
  internal: "Internal",
  external: "External",
  decision: "Decision",
  dependency: "Dependency",
  review: "In review",
};

export const WAITING_KINDS: readonly WaitingKind[] = [
  "internal",
  "external",
  "decision",
  "dependency",
  "review",
];

export const COST_OF_DELAY_BANDS: readonly CostOfDelayBand[] = [
  "critical",
  "high",
  "standard",
  "low",
];

export const COST_OF_DELAY_LABEL: Record<CostOfDelayBand, string> = {
  critical: "Critical",
  high: "High",
  standard: "Standard",
  low: "Low",
};

export const COST_OF_DELAY_WEIGHT: Record<CostOfDelayBand, number> = {
  critical: 8,
  high: 4,
  standard: 2,
  low: 1,
};

const WAITING_KIND_BY_STATE: Partial<Record<FlowState, WaitingKind>> = {
  waiting_internal: "internal",
  waiting_external: "external",
  waiting_decision: "decision",
  waiting_dependency: "dependency",
  review: "review",
};

export function waitingKindOf(state: FlowState): WaitingKind | null {
  return WAITING_KIND_BY_STATE[state] ?? null;
}

export function isWaitingState(state: FlowState): boolean {
  return waitingKindOf(state) !== null;
}

export function isOpenState(state: FlowState): boolean {
  return state !== "done" && state !== "cancelled";
}

export const SCOPE_LABEL: Record<FlowScope, string> = {
  self: "Me",
  team: "My team",
  org: "Organization",
};

// ── API response shapes ─────────────────────────────────────────────────────

export type FlowSummaryResponse = {
  scope: FlowScope;
  allowedScopes: FlowScope[];
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
  trend: Array<{ at: string; teamDays: number }>;
  wip: { openCount: number; limit: number | null; exceeded: boolean };
};

export type AgingPoint = {
  id: string;
  title: string;
  projectName: string | null;
  flowState: FlowState;
  costOfDelayBand: CostOfDelayBand;
  queueAgeDays: number;
};

export type AgingResponse = {
  scope: FlowScope;
  items: AgingPoint[];
  percentiles: { p50: number; p85: number; p95: number } | null;
  sampleSize: number;
};

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

export type WaitingResponse = {
  scope: FlowScope;
  group: "holder" | "project";
  sort: "cost" | "age" | "project";
  totals: { itemCount: number; teamDays: number };
  filteredCount: number;
  items: WaitingRow[];
  byHolder: WaitingGroup[];
  byProject: WaitingGroup[];
};

// ── Display helpers ─────────────────────────────────────────────────────────

/**
 * §7.6 — precision below a day is false precision, so under one working day we
 * say when it started instead of quoting a fraction.
 */
export function formatWorkingDays(days: number): string {
  if (days < 0.15) return "since this morning";
  if (days < 1) return "since yesterday";
  if (days < 1.15) return "1 working day";
  return `${days.toFixed(1)} working days`;
}

/** Team-days is the headline unit on /flow (§4.9). */
export function formatTeamDays(days: number): string {
  if (days === 0) return "0 team-days";
  if (days < 1) return `${days.toFixed(1)} team-days`;
  return `${Math.round(days * 10) / 10} team-days`;
}

// ── Offline mock read-through ───────────────────────────────────────────────

const WORK_DAYS = new Set([1, 2, 3, 4, 5]);
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
const WORKING_SECONDS_PER_DAY = (WORK_END_HOUR - WORK_START_HOUR) * 3600;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Offline mirror of packages/shared/src/workingTime.ts. */
function workingSecondsBetween(from: string | number, to: string | number): number {
  const start = typeof from === "number" ? from : Date.parse(from);
  const end = typeof to === "number" ? to : Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  let total = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= end) {
    if (WORK_DAYS.has(cursor.getDay())) {
      const open = new Date(cursor).setHours(WORK_START_HOUR, 0, 0, 0);
      const close = new Date(cursor).setHours(WORK_END_HOUR, 0, 0, 0);
      const overlap = Math.min(close, end) - Math.max(open, start);
      if (overlap > 0) total += overlap;
    }
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return Math.round(total / 1000);
}

function toWorkingDays(seconds: number): number {
  return Math.round((seconds / WORKING_SECONDS_PER_DAY) * 10) / 10;
}

/**
 * v2 collapsed every flavour of waiting into a date-derived status, so this is a
 * best-effort read of the old shape — the same compromise migration 0004 makes.
 * An escalated item is by definition held up on someone else; an at-risk item
 * owned by an outside party is waiting on them.
 */
export function flowStateOf(c: Commitment): FlowState {
  if (c.needs_review) return "proposed";
  if (c.status === "done") return "done";
  if (c.status === "escalated") return "waiting_internal";
  if ((c.status === "at_risk" || c.status === "overdue") && c.owner_external_name) {
    return "waiting_external";
  }
  if (c.status === "in_progress") return "active";
  if ((c.progress_pct ?? 0) > 0) return "active";
  return "ready";
}

export function bandOf(c: Commitment): CostOfDelayBand {
  switch (c.priority) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "standard";
  }
}

type DerivedRow = {
  commitment: Commitment;
  flowState: FlowState;
  since: number;
  queueStart: number;
  band: CostOfDelayBand;
  holderLabel: string;
  holderKey: string;
  holderUserId: string | null;
  projectName: string | null;
};

function holderOf(c: Commitment, state: FlowState, userMap: Map<string, User>) {
  if (state === "waiting_external") {
    const label = c.owner_external_name ?? "An external party";
    return { holderLabel: label, holderKey: label, holderUserId: null };
  }
  const owner = c.owner_id ? userMap.get(c.owner_id) : undefined;
  if (owner) {
    return { holderLabel: owner.full_name, holderKey: owner.id, holderUserId: owner.id };
  }
  const label = c.owner_external_name ?? "Unassigned";
  return { holderLabel: label, holderKey: label, holderUserId: null };
}

function derive(
  commitments: Commitment[],
  users: User[],
  projects: Project[],
): DerivedRow[] {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  return commitments.map((c) => {
    const flowState = flowStateOf(c);
    return {
      commitment: c,
      flowState,
      since: Date.parse(c.updated_at ?? c.created_at),
      queueStart: Date.parse(c.created_at),
      band: bandOf(c),
      projectName: c.project_id ? projectMap.get(c.project_id) ?? null : null,
      ...holderOf(c, flowState, userMap),
    };
  });
}

function waitingTeamDaysAt(rows: DerivedRow[], at: number): {
  teamDays: number;
  itemCount: number;
} {
  let seconds = 0;
  let itemCount = 0;
  for (const row of rows) {
    if (!isWaitingState(row.flowState) || row.since > at) continue;
    itemCount += 1;
    seconds += workingSecondsBetween(row.since, at);
  }
  return { teamDays: toWorkingDays(seconds), itemCount };
}

export type MockFlowInput = {
  commitments: Commitment[];
  users: User[];
  projects: Project[];
  scope: FlowScope;
  allowedScopes: FlowScope[];
};

export function mockWaitingRegister(input: MockFlowInput): WaitingResponse {
  const now = Date.now();
  const rows = derive(input.commitments, input.users, input.projects);

  const items: WaitingRow[] = rows
    .filter((row) => isWaitingState(row.flowState))
    .map((row) => {
      const workingSeconds = workingSecondsBetween(row.since, now);
      return {
        id: row.commitment.id,
        title: row.commitment.title,
        projectId: row.commitment.project_id,
        projectName: row.projectName,
        flowState: row.flowState,
        waitingKind: waitingKindOf(row.flowState)!,
        holderKey: row.holderKey,
        holderLabel: row.holderLabel,
        holderUserId: row.holderUserId,
        since: new Date(row.since).toISOString(),
        workingSeconds,
        workingDays: toWorkingDays(workingSeconds),
        costOfDelayBand: row.band,
        costScore: COST_OF_DELAY_WEIGHT[row.band] * workingSeconds,
        needsLook: false,
      };
    })
    .sort((a, b) => b.costScore - a.costScore);

  const group = (keyOf: (r: WaitingRow) => string, labelOf: (r: WaitingRow) => string) => {
    const map = new Map<string, WaitingGroup>();
    for (const row of items) {
      const key = keyOf(row);
      let g = map.get(key);
      if (!g) {
        g = { key, label: labelOf(row), itemCount: 0, workingDays: 0, itemIds: [] };
        map.set(key, g);
      }
      g.itemCount += 1;
      g.workingDays = Math.round((g.workingDays + row.workingDays) * 10) / 10;
      g.itemIds.push(row.id);
    }
    return [...map.values()].sort((a, b) => b.workingDays - a.workingDays);
  };

  return {
    scope: input.scope,
    group: "holder",
    sort: "cost",
    totals: {
      itemCount: items.length,
      teamDays: toWorkingDays(items.reduce((s, r) => s + r.workingSeconds, 0)),
    },
    filteredCount: items.length,
    items,
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

export function mockFlowSummary(input: MockFlowInput): FlowSummaryResponse {
  const now = Date.now();
  const rows = derive(input.commitments, input.users, input.projects);
  const register = mockWaitingRegister(input);

  const current = waitingTeamDaysAt(rows, now);
  const previous = waitingTeamDaysAt(rows, now - WEEK_MS);
  const deltaDays = Math.round((current.teamDays - previous.teamDays) * 10) / 10;

  const longest = [...register.items].sort((a, b) => b.workingSeconds - a.workingSeconds)[0];

  // Without a flow_events log the mock plane can only see items that closed,
  // which is the closest available reading of "left a waiting state".
  const unblockedThisWeek = input.commitments.filter(
    (c) => c.resolved_at && Date.parse(c.resolved_at) >= now - WEEK_MS,
  ).length;

  const trend = Array.from({ length: 12 }, (_, i) => {
    const at = now - (11 - i) * WEEK_MS;
    return { at: new Date(at).toISOString(), teamDays: waitingTeamDaysAt(rows, at).teamDays };
  });

  return {
    scope: input.scope,
    allowedScopes: input.allowedScopes,
    waitingNow: current,
    longestWait: longest
      ? {
          commitmentId: longest.id,
          title: longest.title,
          workingDays: longest.workingDays,
          holderLabel: longest.holderLabel,
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
      openCount: rows.filter((r) => isOpenState(r.flowState) && r.flowState !== "proposed").length,
      limit: null,
      exceeded: false,
    },
  };
}

export function mockAging(input: MockFlowInput): AgingResponse {
  const now = Date.now();
  const rows = derive(input.commitments, input.users, input.projects);
  const completed: number[] = [];
  const items: AgingPoint[] = [];

  for (const row of rows) {
    if (row.flowState === "done") {
      const resolved = row.commitment.resolved_at;
      if (resolved) {
        completed.push(toWorkingDays(workingSecondsBetween(row.queueStart, Date.parse(resolved))));
      }
      continue;
    }
    if (!isOpenState(row.flowState) || row.flowState === "proposed") continue;
    items.push({
      id: row.commitment.id,
      title: row.commitment.title,
      projectName: row.projectName,
      flowState: row.flowState,
      costOfDelayBand: row.band,
      queueAgeDays: toWorkingDays(workingSecondsBetween(row.queueStart, now)),
    });
  }

  items.sort((a, b) => b.queueAgeDays - a.queueAgeDays);
  completed.sort((a, b) => a - b);

  const pick = (p: number) => {
    const idx = (completed.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const value = lo === hi ? completed[lo] : completed[lo] + (completed[hi] - completed[lo]) * (idx - lo);
    return Math.round(value * 10) / 10;
  };

  return {
    scope: input.scope,
    items,
    // Under five closed items a percentile line is a guess with a ruler on it.
    percentiles:
      completed.length >= 5 ? { p50: pick(0.5), p85: pick(0.85), p95: pick(0.95) } : null,
    sampleSize: completed.length,
  };
}
