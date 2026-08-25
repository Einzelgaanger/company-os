/**
 * Flow reads for /flow/summary, /flow/aging and /waiting.
 *
 * One loader for both data planes: Postgres via withTenantContext when
 * DATABASE_URL is set, the memory demo store otherwise (LOOP_MEMORY_STORE=1,
 * and by default under vitest). Both return the same shape, so the routes and
 * the pure functions in @loop/shared never learn which plane answered.
 */
import { schema, withTenantContext } from "@loop/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  isFlowState,
  isOpenState,
  isWaitingState,
  resolveCostOfDelayBand,
  type CostOfDelayBand,
  type CostOfDelayBandSource,
  type FlowCommitment,
  type FlowEvent,
  type FlowState,
  type TenantTimeSettings,
} from "@loop/shared";
import { storeMode } from "./index.js";
import {
  ensureSeedUsers,
  getTenantTimeSettings,
  listCommitments,
  listFlowEvents,
  listProjects,
  listUsers,
} from "./memory.js";

/** 08_PAGES §8.2 — the three scopes a role may be granted. */
export type FlowScope = "self" | "team" | "org";

export type FlowContext = {
  scope: FlowScope;
  commitments: FlowCommitment[];
  events: FlowEvent[];
  settings: TenantTimeSettings;
  /** Advisory only (§4.8). Loop is an instrument, not a gate. */
  wipLimit: number | null;
};

type RawCommitment = {
  id: string;
  title: string;
  projectId: string | null;
  ownerUserId: string | null;
  flowState: FlowState;
  flowStateSince: string;
  firstReadyAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  waitingOnUserId: string | null;
  waitingOnExternalName: string | null;
  waitingOnCommitmentId: string | null;
  /** Only the demo store carries a pre-resolved label; Postgres derives it. */
  waitingOnLabel: string | null;
  costOfDelayBand: CostOfDelayBand;
  costOfDelayBandSource: CostOfDelayBandSource;
  committedDate: string | null;
  needsLook: boolean;
};

type Roster = Map<string, { fullName: string; managerId: string | null }>;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * §7.6 — name the holder as the team or role where possible, and as a person
 * only when the person is the right point of contact. Falls back to the
 * blocking item's title for a dependency, because "waiting on a commitment" is
 * only useful if you can see which one.
 */
function holderLabel(
  row: RawCommitment,
  roster: Roster,
  titles: Map<string, string>,
): string | null {
  if (row.waitingOnLabel) return row.waitingOnLabel;
  if (row.waitingOnExternalName) return row.waitingOnExternalName;
  if (row.waitingOnUserId) return roster.get(row.waitingOnUserId)?.fullName ?? null;
  if (row.waitingOnCommitmentId) {
    const title = titles.get(row.waitingOnCommitmentId);
    // Prefixed so a group header cannot be misread as a person's name.
    return title ? `Blocked by "${title}"` : null;
  }
  return null;
}

/**
 * `self` is the viewer's own queue plus anything held up on them. `team` adds
 * their direct reports. `org` is everything. Scoping is applied here, at query
 * time, so no handler can widen it by forgetting a filter.
 */
function inScope(
  row: RawCommitment,
  scope: FlowScope,
  viewerUserId: string,
  roster: Roster,
): boolean {
  if (scope === "org") return true;
  const own = row.ownerUserId === viewerUserId || row.waitingOnUserId === viewerUserId;
  if (scope === "self") return own;
  if (own) return true;
  const owner = row.ownerUserId ? roster.get(row.ownerUserId) : undefined;
  const holder = row.waitingOnUserId ? roster.get(row.waitingOnUserId) : undefined;
  return owner?.managerId === viewerUserId || holder?.managerId === viewerUserId;
}

function assemble(
  rows: RawCommitment[],
  events: FlowEvent[],
  roster: Roster,
  scope: FlowScope,
  viewerUserId: string,
  projectNames: Map<string, string>,
  projectBands: Map<string, CostOfDelayBand>,
  settings: TenantTimeSettings,
  wipLimit: number | null,
): FlowContext {
  const titles = new Map(rows.map((r) => [r.id, r.title]));

  // §4.5 the one derived signal: an item other items are blocked on is promoted
  // one band while those dependencies are open, because blocking others costs.
  const blockedCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.waitingOnCommitmentId) continue;
    if (!isOpenState(row.flowState)) continue;
    blockedCounts.set(
      row.waitingOnCommitmentId,
      (blockedCounts.get(row.waitingOnCommitmentId) ?? 0) + 1,
    );
  }

  const visible = rows.filter((row) => inScope(row, scope, viewerUserId, roster));
  const visibleIds = new Set(visible.map((r) => r.id));

  const commitments: FlowCommitment[] = visible.map((row) => {
    const blockedItemCount = blockedCounts.get(row.id) ?? 0;
    const resolved = resolveCostOfDelayBand({
      commitmentBand: row.costOfDelayBand,
      commitmentBandSource: row.costOfDelayBandSource,
      projectBand: row.projectId ? projectBands.get(row.projectId) ?? null : null,
      blockedItemCount,
    });
    return {
      id: row.id,
      title: row.title,
      projectId: row.projectId,
      projectName: row.projectId ? projectNames.get(row.projectId) ?? null : null,
      ownerUserId: row.ownerUserId,
      flowState: row.flowState,
      flowStateSince: row.flowStateSince,
      firstReadyAt: row.firstReadyAt,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      waitingOnUserId: row.waitingOnUserId,
      waitingOnExternalName: row.waitingOnExternalName,
      waitingOnLabel: holderLabel(row, roster, titles),
      costOfDelayBand: resolved.band,
      costOfDelayBandSource: resolved.source,
      blockedItemCount,
      committedDate: row.committedDate,
      needsLook: row.needsLook,
    };
  });

  return {
    scope,
    commitments,
    events: events.filter((e) => visibleIds.has(e.commitmentId)),
    settings,
    wipLimit,
  };
}

async function loadFromMemory(
  tenantId: string,
  viewerUserId: string,
  scope: FlowScope,
): Promise<FlowContext> {
  await ensureSeedUsers();

  const roster: Roster = new Map(
    listUsers(tenantId).map((u) => [u.id, { fullName: u.fullName, managerId: u.managerId }]),
  );
  const projects = listProjects(tenantId);

  const rows: RawCommitment[] = listCommitments(tenantId).map((c) => ({
    id: c.id,
    title: c.title,
    projectId: c.projectId,
    ownerUserId: c.ownerUserId,
    flowState: c.flowState,
    flowStateSince: c.flowStateSince,
    firstReadyAt: c.firstReadyAt,
    createdAt: c.createdAt,
    resolvedAt: c.resolvedAt,
    waitingOnUserId: c.waitingOnUserId,
    waitingOnExternalName: c.waitingOnExternalName,
    waitingOnCommitmentId: c.waitingOnCommitmentId,
    waitingOnLabel: c.waitingOnLabel,
    costOfDelayBand: c.costOfDelayBand,
    costOfDelayBandSource: c.costOfDelayBandSource,
    committedDate: c.committedDate,
    needsLook: c.needsLook,
  }));

  const events: FlowEvent[] = listFlowEvents(tenantId).map((e) => ({
    commitmentId: e.commitmentId,
    fromState: e.fromState,
    toState: e.toState,
    createdAt: e.createdAt,
  }));

  return assemble(
    rows,
    events,
    roster,
    scope,
    viewerUserId,
    new Map(projects.map((p) => [p.id, p.name])),
    new Map(projects.map((p) => [p.id, p.costOfDelayBand])),
    getTenantTimeSettings(tenantId),
    null,
  );
}

const DEFAULT_TIME_SETTINGS: TenantTimeSettings = {
  timezone: "Africa/Nairobi",
  workDays: [1, 2, 3, 4, 5],
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
  holidays: [],
};

async function loadFromPostgres(
  tenantId: string,
  viewerUserId: string,
  scope: FlowScope,
): Promise<FlowContext> {
  return withTenantContext(tenantId, async (db) => {
    const [settingsRow] = await db
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.tenantId, tenantId))
      .limit(1);

    const holidayRows = await db
      .select({ holidayDate: schema.tenantHolidays.holidayDate })
      .from(schema.tenantHolidays)
      .where(eq(schema.tenantHolidays.tenantId, tenantId));

    const userRows = await db
      .select({
        id: schema.users.id,
        fullName: schema.users.fullName,
        managerId: schema.users.managerId,
      })
      .from(schema.users)
      .where(eq(schema.users.tenantId, tenantId));

    const projectRows = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        costOfDelayBand: schema.projects.costOfDelayBand,
      })
      .from(schema.projects)
      .where(eq(schema.projects.tenantId, tenantId));

    const commitmentRows = await db
      .select()
      .from(schema.commitments)
      .where(eq(schema.commitments.tenantId, tenantId));

    const rows: RawCommitment[] = commitmentRows
      .filter((c) => !c.deletedAt)
      .map((c) => ({
        id: c.id,
        title: c.title,
        projectId: c.projectId,
        ownerUserId: c.ownerUserId,
        flowState: c.flowState,
        flowStateSince: iso(c.flowStateSince) ?? iso(c.createdAt)!,
        firstReadyAt: iso(c.firstReadyAt),
        createdAt: iso(c.createdAt)!,
        resolvedAt: iso(c.resolvedAt),
        waitingOnUserId: c.waitingOnUserId,
        waitingOnExternalName: c.waitingOnExternalName,
        waitingOnCommitmentId: c.waitingOnCommitmentId,
        waitingOnLabel: null,
        costOfDelayBand: c.costOfDelayBand,
        costOfDelayBandSource: c.costOfDelayBandSource,
        committedDate: c.committedDate,
        needsLook: c.needsLook,
      }));

    const ids = rows.map((r) => r.id);
    const eventRows = ids.length
      ? await db
          .select({
            commitmentId: schema.flowEvents.commitmentId,
            fromState: schema.flowEvents.fromState,
            toState: schema.flowEvents.toState,
            createdAt: schema.flowEvents.createdAt,
          })
          .from(schema.flowEvents)
          .where(
            and(
              eq(schema.flowEvents.tenantId, tenantId),
              inArray(schema.flowEvents.commitmentId, ids),
            ),
          )
      : [];

    const events: FlowEvent[] = eventRows
      .filter((e) => isFlowState(e.toState))
      .map((e) => ({
        commitmentId: e.commitmentId,
        fromState: isFlowState(e.fromState) ? e.fromState : null,
        toState: e.toState,
        createdAt: iso(e.createdAt)!,
      }));

    const settings: TenantTimeSettings = settingsRow
      ? {
          timezone: settingsRow.timezone,
          workDays: settingsRow.workDays,
          quietHoursStart: settingsRow.quietHoursStart,
          quietHoursEnd: settingsRow.quietHoursEnd,
          holidays: holidayRows.map((h) => h.holidayDate),
        }
      : { ...DEFAULT_TIME_SETTINGS, holidays: holidayRows.map((h) => h.holidayDate) };

    return assemble(
      rows,
      events,
      new Map(
        userRows.map((u) => [u.id, { fullName: u.fullName, managerId: u.managerId ?? null }]),
      ),
      scope,
      viewerUserId,
      new Map(projectRows.map((p) => [p.id, p.name])),
      new Map(projectRows.map((p) => [p.id, p.costOfDelayBand])),
      settings,
      null,
    );
  });
}

export async function loadFlowContext(
  tenantId: string,
  viewerUserId: string,
  scope: FlowScope,
): Promise<FlowContext> {
  return storeMode === "postgres"
    ? loadFromPostgres(tenantId, viewerUserId, scope)
    : loadFromMemory(tenantId, viewerUserId, scope);
}

/** Waiting-state filter for /waiting's type multi-select. */
export function isWaiting(state: FlowState): boolean {
  return isWaitingState(state);
}
