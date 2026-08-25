/**
 * In-memory tenant store for offline Fastify demos (no live Postgres).
 * Replace with @loop/db + withTenantContext at cutover.
 */
import { randomUUID } from "node:crypto";
import type {
  CostOfDelayBand,
  CostOfDelayBandSource,
  FlowState,
  TenantTimeSettings,
} from "@loop/shared";
import { hashPassword } from "../plugins/auth.js";

export type MemoryUser = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  managerId: string | null;
  passwordHash: string;
};

export type MemoryProject = {
  id: string;
  tenantId: string;
  name: string;
  costOfDelayBand: CostOfDelayBand;
};

export type MemoryCommitment = {
  id: string;
  tenantId: string;
  title: string;
  projectId: string | null;
  ownerUserId: string;
  status: "open" | "in_progress" | "at_risk" | "overdue" | "escalated" | "done" | "cancelled";
  needsReview: boolean;
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
  // ── B1 flow model (04_FLOW_ENGINE §4.2–§4.6) ──────────────────────────────
  flowState: FlowState;
  flowStateSince: string;
  firstReadyAt: string | null;
  resolvedAt: string | null;
  waitingOnUserId: string | null;
  waitingOnExternalName: string | null;
  waitingOnCommitmentId: string | null;
  /**
   * Display name for the holder. Postgres derives this from the roster and the
   * team table; the demo store carries it so the seed can name a team ("the
   * data team") rather than a person where that is the truer answer (§7.6).
   */
  waitingOnLabel: string | null;
  costOfDelayBand: CostOfDelayBand;
  costOfDelayBandSource: CostOfDelayBandSource;
  committedDate: string | null;
  needsLook: boolean;
};

/** §4.2 — append-only transition log. Every flow metric derives from this. */
export type MemoryFlowEvent = {
  tenantId: string;
  commitmentId: string;
  fromState: FlowState | null;
  toState: FlowState;
  createdAt: string;
};

/**
 * v2 collapsed every flavour of waiting into one status, so the reverse mapping
 * cannot recover which one it was. Mirrors migration 0004's backfill: 'blocked'
 * lands on waiting_internal and the date-derived annotations fall back to ready.
 */
const FLOW_STATE_FROM_STATUS: Record<MemoryCommitment["status"], FlowState> = {
  open: "ready",
  in_progress: "active",
  at_risk: "ready",
  overdue: "ready",
  escalated: "ready",
  done: "done",
  cancelled: "cancelled",
};

export function flowStateFromStatus(
  status: MemoryCommitment["status"],
  needsReview: boolean,
): FlowState {
  return needsReview ? "proposed" : FLOW_STATE_FROM_STATUS[status];
}

const COST_OF_DELAY_FROM_PRIORITY: Record<
  MemoryCommitment["priority"],
  CostOfDelayBand
> = {
  critical: "critical",
  high: "high",
  medium: "standard",
  low: "low",
};

export type MemoryCompliance = {
  tenantId: string;
  attestedByUserId: string;
  attestedAt: string;
  lawfulBasis: string;
  high_risk_use_prohibited: true;
  payload: Record<string, unknown>;
};

const users = new Map<string, MemoryUser>(); // email lower → user
const usersById = new Map<string, MemoryUser>();
const projects = new Map<string, MemoryProject>();
const commitments = new Map<string, MemoryCommitment>();
const flowEvents: MemoryFlowEvent[] = [];
const compliance = new Map<string, MemoryCompliance>();

let seeded = false;

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000010";

/**
 * §4.4 defaults for the demo tenant. Postgres reads `tenant_settings` and
 * `tenant_holidays`; this mirrors the column defaults so working-time maths is
 * identical on both planes.
 */
const DEMO_TIME_SETTINGS: TenantTimeSettings = {
  timezone: "Africa/Nairobi",
  workDays: [1, 2, 3, 4, 5],
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
  holidays: [],
};

const DAY_MS = 86_400_000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

/** A declarative state history; the last entry is the current state. */
type SeedHistory = ReadonlyArray<{ state: FlowState; daysAgo: number }>;

type SeedCommitment = {
  id: string;
  title: string;
  projectId: string | null;
  ownerUserId: string;
  status: MemoryCommitment["status"];
  needsReview?: boolean;
  priority: MemoryCommitment["priority"];
  costOfDelayBand: CostOfDelayBand;
  costOfDelayBandSource?: CostOfDelayBandSource;
  history: SeedHistory;
  waitingOnUserId?: string | null;
  waitingOnExternalName?: string | null;
  waitingOnCommitmentId?: string | null;
  waitingOnLabel?: string | null;
  committedDate?: string | null;
  needsLook?: boolean;
};

function seedCommitment(tenantId: string, seed: SeedCommitment): void {
  const history = [...seed.history].sort((a, b) => b.daysAgo - a.daysAgo);
  const current = history[history.length - 1];
  const firstReady = history.find((h) => h.state !== "proposed");
  const doneEntry = history.find((h) => h.state === "done");

  const row: MemoryCommitment = {
    id: seed.id,
    tenantId,
    title: seed.title,
    projectId: seed.projectId,
    ownerUserId: seed.ownerUserId,
    status: seed.status,
    needsReview: seed.needsReview ?? false,
    priority: seed.priority,
    createdAt: daysAgo(history[0].daysAgo),
    updatedAt: daysAgo(current.daysAgo),
    flowState: current.state,
    flowStateSince: daysAgo(current.daysAgo),
    firstReadyAt: firstReady ? daysAgo(firstReady.daysAgo) : null,
    resolvedAt: doneEntry ? daysAgo(doneEntry.daysAgo) : null,
    waitingOnUserId: seed.waitingOnUserId ?? null,
    waitingOnExternalName: seed.waitingOnExternalName ?? null,
    waitingOnCommitmentId: seed.waitingOnCommitmentId ?? null,
    waitingOnLabel: seed.waitingOnLabel ?? null,
    costOfDelayBand: seed.costOfDelayBand,
    costOfDelayBandSource: seed.costOfDelayBandSource ?? "manual",
    committedDate: seed.committedDate ?? null,
    needsLook: seed.needsLook ?? false,
  };
  commitments.set(row.id, row);

  let from: FlowState | null = null;
  for (const entry of history) {
    flowEvents.push({
      tenantId,
      commitmentId: row.id,
      fromState: from,
      toState: entry.state,
      createdAt: daysAgo(entry.daysAgo),
    });
    from = entry.state;
  }
}

export async function ensureSeedUsers(): Promise<void> {
  if (seeded) return;
  seeded = true;
  const passwordHash = await hashPassword("LoopDemo2026!");
  const tenantId = DEMO_TENANT_ID;

  const roster: Array<Omit<MemoryUser, "passwordHash">> = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId,
      email: "alfred@prodg.studio",
      fullName: "Alfred Maweu",
      role: "owner",
      managerId: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      tenantId,
      email: "priya@prodg.studio",
      fullName: "Priya Shah",
      role: "manager",
      managerId: "00000000-0000-0000-0000-000000000001",
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      tenantId,
      email: "sam@prodg.studio",
      fullName: "Sam Otieno",
      role: "member",
      managerId: "00000000-0000-0000-0000-000000000002",
    },
  ];
  for (const person of roster) {
    const row: MemoryUser = { ...person, passwordHash };
    users.set(row.email, row);
    usersById.set(row.id, row);
  }
  const [alfred, priya, sam] = roster;

  const northgate: MemoryProject = {
    id: "10000000-0000-0000-0000-000000000001",
    tenantId,
    name: "Northgate migration",
    costOfDelayBand: "high",
  };
  const pilot: MemoryProject = {
    id: "10000000-0000-0000-0000-000000000002",
    tenantId,
    name: "Loop pilot",
    costOfDelayBand: "standard",
  };
  projects.set(northgate.id, northgate);
  projects.set(pilot.id, pilot);

  // Kenya public holidays for the pilot year (04_FLOW_ENGINE §4.4).
  if (listHolidays(tenantId).length === 0) {
    for (const h of [
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-04-03", name: "Good Friday" },
      { date: "2026-04-06", name: "Easter Monday" },
      { date: "2026-05-01", name: "Labour Day" },
      { date: "2026-06-01", name: "Madaraka Day" },
      { date: "2026-10-10", name: "Huduma Day" },
      { date: "2026-10-20", name: "Mashujaa Day" },
      { date: "2026-12-12", name: "Jamhuri Day" },
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2026-12-26", name: "Boxing Day" },
    ]) {
      addHoliday({ tenantId, date: h.date, name: h.name });
    }
  }

  const sharepoint = "20000000-0000-0000-0000-000000000001";

  const seeds: SeedCommitment[] = [
    {
      id: sharepoint,
      title: "SharePoint access for the data pull",
      projectId: northgate.id,
      ownerUserId: sam.id,
      status: "at_risk",
      priority: "critical",
      costOfDelayBand: "critical",
      waitingOnExternalName: "Northgate IT",
      waitingOnLabel: "Northgate IT",
      committedDate: new Date(Date.now() + 3 * DAY_MS).toISOString().slice(0, 10),
      history: [
        { state: "ready", daysAgo: 16 },
        { state: "active", daysAgo: 14 },
        { state: "waiting_external", daysAgo: 12 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000002",
      title: "Sign-off on the revised migration scope",
      projectId: northgate.id,
      ownerUserId: priya.id,
      status: "open",
      priority: "high",
      costOfDelayBand: "high",
      waitingOnUserId: priya.id,
      waitingOnLabel: "Priya Shah",
      history: [
        { state: "ready", daysAgo: 9 },
        { state: "waiting_decision", daysAgo: 6 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000003",
      title: "Migrate the finance folders",
      projectId: northgate.id,
      ownerUserId: sam.id,
      status: "open",
      priority: "medium",
      costOfDelayBand: "standard",
      waitingOnCommitmentId: sharepoint,
      waitingOnLabel: "SharePoint access for the data pull",
      history: [
        { state: "ready", daysAgo: 10 },
        { state: "waiting_dependency", daysAgo: 4 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000004",
      title: "Latency benchmark numbers",
      projectId: pilot.id,
      ownerUserId: alfred.id,
      status: "open",
      priority: "high",
      costOfDelayBand: "high",
      waitingOnLabel: "the data team",
      history: [
        { state: "ready", daysAgo: 13 },
        { state: "active", daysAgo: 11 },
        { state: "waiting_internal", daysAgo: 8 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000005",
      title: "Draft the pilot baseline report",
      projectId: pilot.id,
      ownerUserId: alfred.id,
      status: "open",
      priority: "medium",
      costOfDelayBand: "standard",
      waitingOnLabel: "Priya Shah",
      waitingOnUserId: priya.id,
      history: [
        { state: "ready", daysAgo: 7 },
        { state: "active", daysAgo: 5 },
        { state: "review", daysAgo: 1 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000006",
      title: "Rewrite the onboarding emails",
      projectId: pilot.id,
      ownerUserId: sam.id,
      status: "in_progress",
      priority: "medium",
      costOfDelayBand: "standard",
      history: [
        { state: "ready", daysAgo: 8 },
        { state: "waiting_internal", daysAgo: 6 },
        { state: "active", daysAgo: 2 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000007",
      title: "Instrument the check-in worker",
      projectId: pilot.id,
      ownerUserId: alfred.id,
      status: "in_progress",
      priority: "low",
      costOfDelayBand: "low",
      needsLook: true,
      history: [
        { state: "ready", daysAgo: 24 },
        { state: "active", daysAgo: 22 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000008",
      title: "Confirm the Q4 holiday calendar",
      projectId: null,
      ownerUserId: priya.id,
      status: "open",
      priority: "low",
      costOfDelayBand: "low",
      history: [{ state: "ready", daysAgo: 3 }],
    },
    {
      id: "20000000-0000-0000-0000-000000000009",
      title: "Second data extract for Northgate",
      projectId: northgate.id,
      ownerUserId: sam.id,
      status: "at_risk",
      needsReview: true,
      priority: "high",
      costOfDelayBand: "high",
      history: [{ state: "proposed", daysAgo: 1 }],
    },
    // Closed items give the aging scatter its percentile lines (§4.8).
    {
      id: "20000000-0000-0000-0000-000000000010",
      title: "Kick-off deck for Northgate",
      projectId: northgate.id,
      ownerUserId: priya.id,
      status: "done",
      priority: "medium",
      costOfDelayBand: "standard",
      history: [
        { state: "ready", daysAgo: 30 },
        { state: "active", daysAgo: 29 },
        { state: "done", daysAgo: 27 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000011",
      title: "Environment access for the pilot",
      projectId: pilot.id,
      ownerUserId: sam.id,
      status: "done",
      priority: "high",
      costOfDelayBand: "high",
      history: [
        { state: "ready", daysAgo: 26 },
        { state: "waiting_internal", daysAgo: 24 },
        { state: "active", daysAgo: 20 },
        { state: "done", daysAgo: 19 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000012",
      title: "Consolidate the survey questions",
      projectId: pilot.id,
      ownerUserId: alfred.id,
      status: "done",
      priority: "low",
      costOfDelayBand: "low",
      history: [
        { state: "ready", daysAgo: 21 },
        { state: "active", daysAgo: 18 },
        { state: "done", daysAgo: 17 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000013",
      title: "Publish the transparency notice",
      projectId: null,
      ownerUserId: alfred.id,
      status: "done",
      priority: "critical",
      costOfDelayBand: "critical",
      history: [
        { state: "ready", daysAgo: 15 },
        { state: "review", daysAgo: 12 },
        { state: "done", daysAgo: 11 },
      ],
    },
    {
      id: "20000000-0000-0000-0000-000000000014",
      title: "Reconcile the meeting import",
      projectId: pilot.id,
      ownerUserId: sam.id,
      status: "done",
      priority: "medium",
      costOfDelayBand: "standard",
      history: [
        { state: "ready", daysAgo: 12 },
        { state: "active", daysAgo: 9 },
        { state: "review", daysAgo: 5 },
        { state: "done", daysAgo: 3 },
      ],
    },
  ];

  for (const seed of seeds) seedCommitment(tenantId, seed);
}

export function getTenantTimeSettings(tenantId: string): TenantTimeSettings {
  const holidayDates = listHolidays(tenantId).map((h) => h.date);
  return { ...DEMO_TIME_SETTINGS, holidays: holidayDates };
}

export function listProjects(tenantId: string): MemoryProject[] {
  return [...projects.values()].filter((p) => p.tenantId === tenantId);
}

export function listFlowEvents(tenantId: string): MemoryFlowEvent[] {
  return flowEvents.filter((e) => e.tenantId === tenantId);
}

/** Append a transition. The caller updates the commitment cache in the same call. */
export function appendFlowEvent(event: MemoryFlowEvent): MemoryFlowEvent {
  flowEvents.push(event);
  return event;
}

export function findUserByEmail(email: string): MemoryUser | undefined {
  return users.get(email.trim().toLowerCase());
}

export function findUserById(id: string): MemoryUser | undefined {
  return usersById.get(id);
}

export function listUsers(tenantId: string): MemoryUser[] {
  return [...usersById.values()].filter((u) => u.tenantId === tenantId);
}

export function listCommitments(tenantId: string): MemoryCommitment[] {
  return [...commitments.values()].filter((c) => c.tenantId === tenantId);
}

export function getCommitment(
  tenantId: string,
  id: string,
): MemoryCommitment | undefined {
  const c = commitments.get(id);
  return c && c.tenantId === tenantId ? c : undefined;
}

export function createCommitment(input: {
  tenantId: string;
  title: string;
  projectId: string | null;
  ownerUserId: string;
  priority: MemoryCommitment["priority"];
  status?: MemoryCommitment["status"];
  needsReview?: boolean;
}): MemoryCommitment {
  const now = new Date().toISOString();
  const status = input.status ?? "open";
  const needsReview = input.needsReview ?? false;
  const flowState = flowStateFromStatus(status, needsReview);
  const row: MemoryCommitment = {
    id: randomUUID(),
    status,
    needsReview,
    createdAt: now,
    updatedAt: now,
    tenantId: input.tenantId,
    title: input.title,
    projectId: input.projectId,
    ownerUserId: input.ownerUserId,
    priority: input.priority,
    flowState,
    flowStateSince: now,
    firstReadyAt: flowState === "proposed" ? null : now,
    resolvedAt: null,
    waitingOnUserId: null,
    waitingOnExternalName: null,
    waitingOnCommitmentId: null,
    waitingOnLabel: null,
    costOfDelayBand: COST_OF_DELAY_FROM_PRIORITY[input.priority],
    costOfDelayBandSource: input.priority === "medium" ? "default" : "manual",
    committedDate: null,
    needsLook: false,
  };
  commitments.set(row.id, row);
  appendFlowEvent({
    tenantId: row.tenantId,
    commitmentId: row.id,
    fromState: null,
    toState: flowState,
    createdAt: now,
  });
  return row;
}

export function updateCommitment(
  tenantId: string,
  id: string,
  patch: Partial<Pick<MemoryCommitment, "title" | "status" | "needsReview" | "priority" | "projectId">>,
): MemoryCommitment | undefined {
  const c = getCommitment(tenantId, id);
  if (!c) return undefined;
  const now = new Date().toISOString();
  Object.assign(c, patch, { updatedAt: now });

  // §4.2: flow_state is a cache of the latest flow_events row, so a status
  // change writes both or neither.
  const nextFlowState = flowStateFromStatus(c.status, c.needsReview);
  if (nextFlowState !== c.flowState) {
    appendFlowEvent({
      tenantId,
      commitmentId: c.id,
      fromState: c.flowState,
      toState: nextFlowState,
      createdAt: now,
    });
    c.flowState = nextFlowState;
    c.flowStateSince = now;
    if (nextFlowState !== "proposed" && !c.firstReadyAt) c.firstReadyAt = now;
    c.resolvedAt = nextFlowState === "done" ? now : null;
  }
  return c;
}

export function deleteCommitment(tenantId: string, id: string): boolean {
  const c = getCommitment(tenantId, id);
  if (!c) return false;
  commitments.delete(id);
  // flow_events cascades on commitment delete in Postgres; mirror that here.
  for (let i = flowEvents.length - 1; i >= 0; i -= 1) {
    if (flowEvents[i].commitmentId === id) flowEvents.splice(i, 1);
  }
  return true;
}

export function listReviewQueue(tenantId: string): MemoryCommitment[] {
  return listCommitments(tenantId).filter((c) => c.needsReview && c.status !== "cancelled");
}

export function confirmReview(
  tenantId: string,
  id: string,
): MemoryCommitment | undefined {
  return updateCommitment(tenantId, id, { needsReview: false });
}

export function rejectReview(
  tenantId: string,
  id: string,
): MemoryCommitment | undefined {
  return updateCommitment(tenantId, id, {
    needsReview: false,
    status: "cancelled",
  });
}

export function upsertCompliance(row: MemoryCompliance): MemoryCompliance {
  compliance.set(row.tenantId, row);
  return row;
}

export function getCompliance(tenantId: string): MemoryCompliance | undefined {
  return compliance.get(tenantId);
}

export type MemorySurveyResponse = {
  themeTags: string[];
};

export type MemorySurveyCycle = {
  id: string;
  tenantId: string;
  title: string;
  closedAt: string | null;
  responses: MemorySurveyResponse[];
};

const surveyCycles = new Map<string, MemorySurveyCycle>();

function seedSurveys(tenantId: string): void {
  if ([...surveyCycles.values()].some((c) => c.tenantId === tenantId)) return;
  surveyCycles.set(`${tenantId}:cycle-below`, {
    id: "cycle-below",
    tenantId,
    title: "Pulse — early August",
    closedAt: "2026-08-10T00:00:00Z",
    responses: [
      { themeTags: ["workload"] },
      { themeTags: ["workload"] },
      { themeTags: ["clarity"] },
      { themeTags: ["clarity"] },
    ],
  });
  surveyCycles.set(`${tenantId}:cycle-ok`, {
    id: "cycle-ok",
    tenantId,
    title: "Pulse — mid August",
    closedAt: "2026-08-20T00:00:00Z",
    responses: [
      { themeTags: ["workload"] },
      { themeTags: ["workload"] },
      { themeTags: ["workload"] },
      { themeTags: ["clarity"] },
      { themeTags: ["clarity"] },
      { themeTags: ["workload"] },
      { themeTags: ["clarity"] },
      { themeTags: ["workload"] },
    ],
  });
}

export function listSurveyCycles(tenantId: string): MemorySurveyCycle[] {
  seedSurveys(tenantId);
  return [...surveyCycles.values()].filter((c) => c.tenantId === tenantId);
}

export function getSurveyCycle(
  tenantId: string,
  cycleId: string,
): MemorySurveyCycle | undefined {
  seedSurveys(tenantId);
  return surveyCycles.get(`${tenantId}:${cycleId}`);
}

export type MemoryConnection = {
  id: string;
  tenantId: string;
  userId: string | null;
  provider: string;
  status: "connected" | "error" | "expired" | "disconnected";
  lastSyncedAt: string | null;
  externalAccountEmail: string | null;
  /** Encrypted blob — never returned by API serializers. */
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string[];
};

const connections = new Map<string, MemoryConnection>();

function seedConnections(tenantId: string): void {
  if ([...connections.values()].some((c) => c.tenantId === tenantId)) return;
  const stale = new Date(Date.now() - 8 * 3600_000).toISOString();
  const fresh = new Date(Date.now() - 30 * 60_000).toISOString();
  connections.set(`${tenantId}:c-fathom`, {
    id: "c-fathom",
    tenantId,
    userId: null,
    provider: "fathom",
    status: "connected",
    lastSyncedAt: fresh,
    externalAccountEmail: "ops@prodg.studio",
  });
  connections.set(`${tenantId}:c-gcal`, {
    id: "c-gcal",
    tenantId,
    userId: "00000000-0000-0000-0000-000000000001",
    provider: "google_calendar",
    status: "expired",
    lastSyncedAt: stale,
    externalAccountEmail: "alfred@prodg.studio",
  });
}

export function listConnections(tenantId: string): MemoryConnection[] {
  seedConnections(tenantId);
  return [...connections.values()].filter((c) => c.tenantId === tenantId);
}

/** Public serializer — tokens never leave the store. */
export function serializeConnection(c: MemoryConnection) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    userId: c.userId,
    provider: c.provider,
    status: c.status,
    lastSyncedAt: c.lastSyncedAt,
    externalAccountEmail: c.externalAccountEmail,
    scopes: c.scopes ?? [],
  };
}

export function upsertConnection(input: {
  tenantId: string;
  userId: string | null;
  provider: string;
  status: MemoryConnection["status"];
  externalAccountEmail: string | null;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string[];
}): MemoryConnection {
  seedConnections(input.tenantId);
  const existing = [...connections.values()].find(
    (c) =>
      c.tenantId === input.tenantId &&
      c.provider === input.provider &&
      (c.userId ?? null) === (input.userId ?? null),
  );
  const id = existing?.id ?? randomUUID();
  const row: MemoryConnection = {
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    status: input.status,
    lastSyncedAt: new Date().toISOString(),
    externalAccountEmail: input.externalAccountEmail,
    accessTokenEnc: input.accessTokenEnc ?? existing?.accessTokenEnc ?? null,
    refreshTokenEnc: input.refreshTokenEnc ?? existing?.refreshTokenEnc ?? null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    scopes: input.scopes ?? [],
  };
  connections.set(`${input.tenantId}:${id}`, row);
  if (existing) connections.delete(`${input.tenantId}:${existing.id}`);
  connections.set(`${input.tenantId}:${id}`, row);
  return row;
}

export function disconnectConnection(tenantId: string, id: string): boolean {
  const key = `${tenantId}:${id}`;
  const row = connections.get(key) ?? [...connections.values()].find((c) => c.id === id && c.tenantId === tenantId);
  if (!row) return false;
  row.status = "disconnected";
  row.accessTokenEnc = null;
  row.refreshTokenEnc = null;
  connections.set(`${tenantId}:${row.id}`, row);
  return true;
}

export type MemoryReport = {
  id: string;
  tenantId: string;
  type: "weekly" | "daily";
  periodStart: string;
  periodEnd: string;
  contentMd: string;
  contentHtml: string | null;
  pdfRef: string | null;
  pdfSha256: string | null;
  status: "generating" | "ready" | "failed";
  createdAt: string;
};

const reports = new Map<string, MemoryReport>();

export function listReports(tenantId: string): MemoryReport[] {
  return [...reports.values()]
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReport(tenantId: string, id: string): MemoryReport | undefined {
  const r = reports.get(id);
  return r && r.tenantId === tenantId ? r : undefined;
}

export function saveReport(row: MemoryReport): MemoryReport {
  reports.set(row.id, row);
  return row;
}

const noticeAcks = new Map<string, { userId: string; at: string; version: string }>();

export function ackNotice(
  userId: string,
  version: string,
): { userId: string; at: string; version: string } {
  const row = { userId, at: new Date().toISOString(), version };
  noticeAcks.set(userId, row);
  return row;
}

export function getNoticeAck(userId: string) {
  return noticeAcks.get(userId);
}

const noticeVersions = new Map<string, string>();

export function publishNotice(tenantId: string, version: string): { tenantId: string; version: string } {
  noticeVersions.set(tenantId, version);
  // Clear acks so users must re-acknowledge
  for (const [uid] of noticeAcks) {
    noticeAcks.delete(uid);
  }
  return { tenantId, version };
}

export function getNoticeVersion(tenantId: string): string {
  return noticeVersions.get(tenantId) ?? "2026-08-v1";
}

export type MemoryDsr = {
  id: string;
  tenantId: string;
  userId: string;
  type: "access" | "erasure" | "rectification" | "objection";
  detail: string | null;
  status: "open" | "in_progress" | "fulfilled" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
};

const dsrRequests = new Map<string, MemoryDsr>();

export function createDsr(
  input: Omit<MemoryDsr, "id" | "createdAt" | "resolvedAt" | "status"> & {
    status?: MemoryDsr["status"];
  },
): MemoryDsr {
  const row: MemoryDsr = {
    id: randomUUID(),
    status: input.status ?? "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    tenantId: input.tenantId,
    userId: input.userId,
    type: input.type,
    detail: input.detail,
  };
  dsrRequests.set(row.id, row);
  return row;
}

export function listDsr(tenantId: string): MemoryDsr[] {
  return [...dsrRequests.values()].filter((d) => d.tenantId === tenantId);
}

export function updateDsr(
  tenantId: string,
  id: string,
  patch: Partial<Pick<MemoryDsr, "status" | "resolvedAt" | "detail">>,
): MemoryDsr | undefined {
  const row = dsrRequests.get(id);
  if (!row || row.tenantId !== tenantId) return undefined;
  Object.assign(row, patch);
  return row;
}

export type MemoryMilestone = {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  weight: number;
  dueDate: string | null;
};

const milestones = new Map<string, MemoryMilestone>();

function seedMilestones(tenantId: string): void {
  if ([...milestones.values()].some((m) => m.tenantId === tenantId)) return;
  milestones.set(`${tenantId}:ms-1`, {
    id: "ms-1",
    tenantId,
    projectId: "any",
    title: "API contract locked",
    status: "in_progress",
    weight: 2,
    dueDate: null,
  });
}

export function listMilestones(tenantId: string, projectId: string): MemoryMilestone[] {
  seedMilestones(tenantId);
  return [...milestones.values()].filter(
    (m) => m.tenantId === tenantId && (m.projectId === projectId || projectId === "any"),
  );
}

export function upsertMilestone(row: MemoryMilestone): MemoryMilestone {
  milestones.set(`${row.tenantId}:${row.id}`, row);
  return row;
}

export type MemorySurveyQuestion = {
  id: string;
  text: string;
  approved: boolean | null;
};

export type MemorySurveyCycleExt = MemorySurveyCycle & {
  status: "draft" | "pending_review" | "live" | "closed";
  questions: MemorySurveyQuestion[];
};

function ensureSurveyExtras(tenantId: string): void {
  seedSurveys(tenantId);
  const liveKey = `${tenantId}:cycle-live`;
  if (!surveyCycles.has(liveKey)) {
    const live: MemorySurveyCycleExt = {
      id: "cycle-live",
      tenantId,
      title: "August pulse — live",
      closedAt: null,
      responses: [],
      status: "live",
      questions: [
        { id: "q1", text: "How clear are priorities?", approved: true },
        { id: "q2", text: "What's blocking you?", approved: true },
      ],
    };
    surveyCycles.set(liveKey, live);
  }
  const reviewKey = `${tenantId}:cycle-review`;
  if (!surveyCycles.has(reviewKey)) {
    const review: MemorySurveyCycleExt = {
      id: "cycle-review",
      tenantId,
      title: "September draft",
      closedAt: null,
      responses: [],
      status: "pending_review",
      questions: [
        { id: "rq1", text: "Workload sustainability?", approved: null },
        { id: "rq2", text: "Slowest handoffs?", approved: null },
      ],
    };
    surveyCycles.set(reviewKey, review);
  }
  // Annotate existing seeded cycles
  for (const c of surveyCycles.values()) {
    if (c.tenantId !== tenantId) continue;
    const ext = c as MemorySurveyCycleExt;
    if (!ext.status) {
      ext.status = c.closedAt ? "closed" : "closed";
      ext.questions = ext.questions ?? [];
    }
  }
}

export function getCurrentSurvey(tenantId: string): MemorySurveyCycleExt | undefined {
  ensureSurveyExtras(tenantId);
  return [...surveyCycles.values()].find(
    (c) => c.tenantId === tenantId && (c as MemorySurveyCycleExt).status === "live",
  ) as MemorySurveyCycleExt | undefined;
}

export function reviewSurveyQuestion(
  tenantId: string,
  cycleId: string,
  questionId: string,
  approved: boolean,
): MemorySurveyCycleExt | undefined {
  ensureSurveyExtras(tenantId);
  const c = surveyCycles.get(`${tenantId}:${cycleId}`) as MemorySurveyCycleExt | undefined;
  if (!c) return undefined;
  c.questions = (c.questions ?? []).map((q) =>
    q.id === questionId ? { ...q, approved } : q,
  );
  return c;
}

export function submitSurveyAnswer(
  tenantId: string,
  cycleId: string,
  themeTags: string[],
  answers?: unknown,
): MemorySurveyCycle | undefined {
  ensureSurveyExtras(tenantId);
  const c = getSurveyCycle(tenantId, cycleId);
  if (!c) return undefined;
  c.responses.push({
    themeTags,
    ...(answers !== undefined ? { answers } : {}),
  });
  return c;
}

export type MemoryMessagingMetrics = {
  tenantId: string;
  metaTier: string;
  qualityRating: "green" | "yellow" | "red";
  sendCapPerDay: number;
  sendsLast24h: number;
  optOutRate7d: number;
  blockRate7d: number;
  optInCount: number;
  updatedAt: string;
};

const messagingMetrics = new Map<string, MemoryMessagingMetrics>();

export type TenantStatus = "provisioning" | "active" | "suspended" | "offboarding";

const tenantStatuses = new Map<string, TenantStatus>();

/** Memory tenants are active unless a test/demo puts them back in provisioning. */
export function getTenantStatus(tenantId: string): TenantStatus {
  return tenantStatuses.get(tenantId) ?? "active";
}

export function setTenantStatus(tenantId: string, status: TenantStatus): void {
  tenantStatuses.set(tenantId, status);
}

export type MemoryInvite = {
  id: string;
  tenantId: string;
  email: string;
  role: "member" | "manager" | "admin";
  invitedByUserId: string;
  createdAt: string;
};

const invites = new Map<string, MemoryInvite>();

export function createInvite(
  input: Omit<MemoryInvite, "id" | "createdAt">,
): MemoryInvite {
  const row: MemoryInvite = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  invites.set(row.id, row);
  return row;
}

export function listInvites(tenantId: string): MemoryInvite[] {
  return [...invites.values()].filter((i) => i.tenantId === tenantId);
}

export type MemoryMessageApproval = {
  id: string;
  tenantId: string;
  recipientUserId: string | null;
  templateKey: string;
  preview: string;
  status: "pending" | "approved" | "rejected" | "sent";
  requestedByUserId: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
};

const messageApprovals = new Map<string, MemoryMessageApproval>();

export function createMessageApproval(
  input: Omit<
    MemoryMessageApproval,
    "id" | "createdAt" | "status" | "decidedByUserId" | "decidedAt"
  >,
): MemoryMessageApproval {
  const row: MemoryMessageApproval = {
    ...input,
    id: randomUUID(),
    status: "pending",
    decidedByUserId: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };
  messageApprovals.set(row.id, row);
  return row;
}

export function listMessageApprovals(tenantId: string): MemoryMessageApproval[] {
  return [...messageApprovals.values()].filter((m) => m.tenantId === tenantId);
}

export function decideMessageApproval(
  tenantId: string,
  id: string,
  approved: boolean,
  decidedByUserId: string,
): MemoryMessageApproval | undefined {
  const row = messageApprovals.get(id);
  if (!row || row.tenantId !== tenantId) return undefined;
  row.status = approved ? "approved" : "rejected";
  row.decidedByUserId = decidedByUserId;
  row.decidedAt = new Date().toISOString();
  return row;
}

export function getMessagingMetrics(tenantId: string): MemoryMessagingMetrics {
  let row = messagingMetrics.get(tenantId);
  if (!row) {
    row = {
      tenantId,
      metaTier: "Standard",
      qualityRating: "green",
      sendCapPerDay: 250,
      sendsLast24h: 18,
      optOutRate7d: 0.008,
      blockRate7d: 0.004,
      optInCount: 6,
      updatedAt: new Date().toISOString(),
    };
    messagingMetrics.set(tenantId, row);
  }
  return row;
}

export type MemoryExclusion = {
  id: string;
  tenantId: string;
  scope: "user" | "meeting" | "keyword" | "domain";
  matchValue: string;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
};

const exclusions = new Map<string, MemoryExclusion>();

export function listExclusions(tenantId: string): MemoryExclusion[] {
  return [...exclusions.values()].filter((e) => e.tenantId === tenantId);
}

export function createExclusion(
  input: Omit<MemoryExclusion, "id" | "createdAt">,
): MemoryExclusion {
  const row: MemoryExclusion = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  exclusions.set(row.id, row);
  return row;
}

export function deleteExclusion(tenantId: string, id: string): boolean {
  const row = exclusions.get(id);
  if (!row || row.tenantId !== tenantId) return false;
  exclusions.delete(id);
  return true;
}

export type MemoryHoliday = {
  id: string;
  tenantId: string;
  date: string;
  name: string;
};

const holidays = new Map<string, MemoryHoliday>();

export function listHolidays(tenantId: string): MemoryHoliday[] {
  return [...holidays.values()]
    .filter((h) => h.tenantId === tenantId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function addHoliday(
  input: Omit<MemoryHoliday, "id">,
): MemoryHoliday {
  const row: MemoryHoliday = { ...input, id: randomUUID() };
  holidays.set(row.id, row);
  return row;
}

export function deleteHoliday(tenantId: string, id: string): boolean {
  const row = holidays.get(id);
  if (!row || row.tenantId !== tenantId) return false;
  holidays.delete(id);
  return true;
}

/** Test reset */
export function __resetMemoryStore(): void {
  users.clear();
  usersById.clear();
  projects.clear();
  commitments.clear();
  flowEvents.length = 0;
  compliance.clear();
  surveyCycles.clear();
  connections.clear();
  noticeAcks.clear();
  noticeVersions.clear();
  dsrRequests.clear();
  milestones.clear();
  messagingMetrics.clear();
  tenantStatuses.clear();
  invites.clear();
  messageApprovals.clear();
  exclusions.clear();
  holidays.clear();
  reports.clear();
  seeded = false;
}
