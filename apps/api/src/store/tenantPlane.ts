/**
 * Dual-plane facade for tenant CRUD — Postgres when storeMode is postgres,
 * memory Maps only for vitest / LOOP_MEMORY_STORE=1.
 */
import { storeMode } from "./index.js";
import * as mem from "./memory.js";

const isPg = () => storeMode === "postgres";

async function pg() {
  return import("./pgTenant.js");
}

export async function listProjectsPlane(tenantId: string) {
  if (!isPg()) return mem.listProjects(tenantId);
  const m = await pg();
  await m.pgEnsurePilotProjects(tenantId);
  return m.pgListProjects(tenantId);
}

export async function listConnectionsPlane(tenantId: string) {
  if (!isPg()) return mem.listConnections(tenantId).map(mem.serializeConnection);
  const m = await pg();
  return m.pgListConnections(tenantId);
}

export async function upsertConnectionPlane(
  input: Parameters<typeof mem.upsertConnection>[0],
) {
  if (!isPg()) return mem.serializeConnection(mem.upsertConnection(input));
  const m = await pg();
  return m.pgUpsertConnection(input);
}

export async function disconnectConnectionPlane(tenantId: string, id: string) {
  if (!isPg()) return mem.disconnectConnection(tenantId, id);
  const m = await pg();
  return m.pgDisconnectConnection(tenantId, id);
}

export async function listReportsPlane(tenantId: string) {
  if (!isPg()) return mem.listReports(tenantId);
  const m = await pg();
  return m.pgListReports(tenantId);
}

export async function getReportPlane(tenantId: string, id: string) {
  if (!isPg()) return mem.getReport(tenantId, id);
  const m = await pg();
  return m.pgGetReport(tenantId, id);
}

export async function saveReportPlane(row: mem.MemoryReport) {
  if (!isPg()) return mem.saveReport(row);
  const m = await pg();
  return m.pgSaveReport(row);
}

export async function listHolidaysPlane(tenantId: string) {
  if (!isPg()) return mem.listHolidays(tenantId);
  const m = await pg();
  return m.pgListHolidays(tenantId);
}

export async function addHolidayPlane(input: {
  tenantId: string;
  date: string;
  name: string;
}) {
  if (!isPg()) return mem.addHoliday(input);
  const m = await pg();
  return m.pgAddHoliday(input);
}

export async function deleteHolidayPlane(tenantId: string, id: string) {
  if (!isPg()) return mem.deleteHoliday(tenantId, id);
  const m = await pg();
  return m.pgDeleteHoliday(tenantId, id);
}

export async function listExclusionsPlane(tenantId: string) {
  if (!isPg()) return mem.listExclusions(tenantId);
  const m = await pg();
  return m.pgListExclusions(tenantId);
}

export async function createExclusionPlane(
  input: Parameters<typeof mem.createExclusion>[0],
) {
  if (!isPg()) return mem.createExclusion(input);
  const m = await pg();
  return m.pgCreateExclusion(input);
}

export async function deleteExclusionPlane(tenantId: string, id: string) {
  if (!isPg()) return mem.deleteExclusion(tenantId, id);
  const m = await pg();
  return m.pgDeleteExclusion(tenantId, id);
}

export async function listInvitesPlane(tenantId: string) {
  if (!isPg()) return mem.listInvites(tenantId);
  const m = await pg();
  return m.pgListInvites(tenantId);
}

export async function createInvitePlane(input: {
  tenantId: string;
  email: string;
  role: "member" | "manager" | "admin";
  invitedByUserId: string;
}) {
  if (!isPg()) return mem.createInvite(input);
  const m = await pg();
  return m.pgCreateInvite(input);
}

export async function listDsrPlane(tenantId: string) {
  if (!isPg()) return mem.listDsr(tenantId);
  const m = await pg();
  return m.pgListDsr(tenantId);
}

export async function createDsrPlane(input: {
  tenantId: string;
  userId: string;
  type: "access" | "erasure" | "rectification" | "objection";
  detail?: string | null;
}) {
  if (!isPg()) {
    return mem.createDsr({
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      detail: input.detail ?? null,
    });
  }
  const m = await pg();
  return m.pgCreateDsr({
    tenantId: input.tenantId,
    userId: input.userId,
    type: input.type,
  });
}

export async function updateDsrPlane(
  tenantId: string,
  id: string,
  patch: { status: "open" | "in_progress" | "fulfilled" | "rejected"; resolvedAt?: string | null },
) {
  if (!isPg()) return mem.updateDsr(tenantId, id, patch);
  const m = await pg();
  const mapped =
    patch.status === "fulfilled"
      ? "fulfilled"
      : patch.status === "rejected"
        ? "rejected"
        : "open";
  return m.pgUpdateDsr(tenantId, id, mapped);
}

export async function listReviewQueuePlane(tenantId: string) {
  if (!isPg()) return mem.listReviewQueue(tenantId);
  const m = await pg();
  return m.pgListReviewQueue(tenantId);
}

export async function confirmReviewPlane(tenantId: string, id: string) {
  if (!isPg()) return mem.confirmReview(tenantId, id);
  const m = await pg();
  return m.pgConfirmReview(tenantId, id);
}

export async function rejectReviewPlane(tenantId: string, id: string) {
  if (!isPg()) return mem.rejectReview(tenantId, id);
  const m = await pg();
  return m.pgRejectReview(tenantId, id);
}

export async function listSurveyCyclesPlane(tenantId: string) {
  if (!isPg()) return mem.listSurveyCycles(tenantId);
  const m = await pg();
  return m.pgListSurveyCycles(tenantId);
}

export async function getSurveyCyclePlane(tenantId: string, cycleId: string) {
  if (!isPg()) return mem.getSurveyCycle(tenantId, cycleId);
  const m = await pg();
  return m.pgGetSurveyCycle(tenantId, cycleId);
}

export async function getSurveyReviewPlane(tenantId: string, cycleId: string) {
  if (!isPg()) {
    void mem.getCurrentSurvey(tenantId);
    return mem.getSurveyCycle(tenantId, cycleId) as ReturnType<
      typeof mem.getCurrentSurvey
    >;
  }
  const m = await pg();
  return m.pgGetSurveyReview(tenantId, cycleId);
}

export async function getCurrentSurveyPlane(tenantId: string) {
  if (!isPg()) return mem.getCurrentSurvey(tenantId);
  const m = await pg();
  return m.pgGetCurrentSurvey(tenantId);
}

export async function submitSurveyAnswerPlane(
  tenantId: string,
  cycleId: string,
  themeTags: string[],
  answers?: unknown,
  userId?: string,
) {
  if (!isPg()) {
    return mem.submitSurveyAnswer(tenantId, cycleId, themeTags, answers);
  }
  const m = await pg();
  return m.pgSubmitSurveyAnswer(
    tenantId,
    cycleId,
    userId ?? "00000000-0000-0000-0000-000000000000",
    themeTags,
  );
}

export async function reviewSurveyQuestionPlane(
  tenantId: string,
  cycleId: string,
  questionId: string,
  approved: boolean,
  approverUserId: string,
) {
  if (!isPg()) {
    return mem.reviewSurveyQuestion(tenantId, cycleId, questionId, approved);
  }
  const m = await pg();
  return m.pgReviewSurveyQuestion(
    tenantId,
    cycleId,
    questionId,
    approved,
    approverUserId,
  );
}

export async function listMilestonesPlane(tenantId: string, projectId: string) {
  if (!isPg()) return mem.listMilestones(tenantId, projectId);
  const m = await pg();
  return m.pgListMilestones(tenantId, projectId);
}

export async function upsertMilestonePlane(row: mem.MemoryMilestone) {
  if (!isPg()) return mem.upsertMilestone(row);
  const m = await pg();
  return m.pgUpsertMilestone(row);
}

export async function getMessagingMetricsPlane(tenantId: string) {
  if (!isPg()) return mem.getMessagingMetrics(tenantId);
  return {
    tenantId,
    metaTier: "unset",
    qualityRating: "green" as const,
    sendCapPerDay: 250,
    sendsLast24h: 0,
    optOutRate7d: 0,
    blockRate7d: 0,
    optInCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function listNudgeTriggersPlane(tenantId: string) {
  if (!isPg()) {
    // Keep route-local Map for memory tests — plane returns null to signal fallback.
    return null;
  }
  const m = await pg();
  return m.pgListNudgeTriggers(tenantId);
}

export async function setNudgeSuspendedPlane(
  tenantId: string,
  triggerId: string,
  suspended: boolean,
) {
  if (!isPg()) return null;
  const m = await pg();
  return m.pgSetNudgeSuspended(tenantId, triggerId, suspended);
}
