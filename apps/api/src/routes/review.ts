import type { FastifyInstance } from "fastify";
import {
  corroborate,
  toWorkingDays,
  workingSecondsBetween,
  type FlowState,
} from "@loop/shared";
import { bindRoute } from "../lib/policy.js";
import {
  ensureSeedUsers,
  getTenantTimeSettings,
  listCommitments,
  listFlowEvents,
} from "../store/memory.js";
import {
  confirmReviewPlane,
  listReviewQueuePlane,
  rejectReviewPlane,
} from "../store/tenantPlane.js";
import { storeMode } from "../store/index.js";
import { pgListCommitments } from "../store/pg.js";

/**
 * Review queue + Might be stale (corroboration).
 */
export async function reviewRoutes(app: FastifyInstance) {
  bindRoute("/review", "GET", "commitment.read");
  bindRoute("/review/:id/confirm", "POST", "commitment.reassign");
  bindRoute("/review/:id/reject", "POST", "commitment.reassign");

  app.get("/review", { preHandler: [app.authenticate] }, async (request) => {
    await ensureSeedUsers();
    const tenantId = request.auth!.tenantId;
    const settings = getTenantTimeSettings(tenantId);
    const now = Date.now();

    const items = await listReviewQueuePlane(tenantId);

    let staleSource: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      needsReview: boolean;
      ownerUserId: string;
      projectId: string | null;
      flowState: string;
      flowStateSince: string;
      needsLook: boolean;
    }>;

    if (storeMode === "postgres") {
      const rows = await pgListCommitments(tenantId);
      staleSource = rows
        .filter((c) => c.needsLook && c.status !== "cancelled" && c.status !== "done")
        .map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          priority: c.priority,
          needsReview: c.reviewRequired,
          ownerUserId: c.ownerUserId ?? "",
          projectId: c.projectId,
          flowState: c.flowState,
          flowStateSince: c.flowStateSince?.toISOString?.() ?? String(c.flowStateSince),
          needsLook: c.needsLook,
        }));
    } else {
      const events = listFlowEvents(tenantId);
      staleSource = listCommitments(tenantId)
        .filter((c) => c.needsLook && c.status !== "cancelled" && c.status !== "done")
        .map((c) => {
          const lastEvent = events
            .filter((e) => e.commitmentId === c.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return {
            id: c.id,
            title: c.title,
            status: c.status,
            priority: c.priority,
            needsReview: c.needsReview,
            ownerUserId: c.ownerUserId,
            projectId: c.projectId,
            flowState: c.flowState,
            flowStateSince: lastEvent?.createdAt ?? c.flowStateSince,
            needsLook: true,
          };
        });
    }

    const stale = staleSource.map((c) => {
      const workingDaysSinceLastEvent = Math.max(
        0,
        Math.floor(
          toWorkingDays(
            workingSecondsBetween(c.flowStateSince, now, settings),
            settings,
          ),
        ),
      );
      const verdict = corroborate({
        commitmentId: c.id,
        claimedState: c.flowState as FlowState,
        workingDaysSinceLastEvent,
        signals: [],
      });
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        priority: c.priority,
        needsReview: c.needsReview,
        needsLook: true,
        ownerUserId: c.ownerUserId,
        projectId: c.projectId,
        prompt:
          verdict.prompt ??
          "This item may need a look — the last update was a while ago.",
        needsLookReason: verdict.needsLookReason ?? "needs_look",
      };
    });

    return { tenantId, items, stale };
  });

  app.post("/review/:id/confirm", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await confirmReviewPlane(request.auth!.tenantId, id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { activated: true, item: row };
  });

  app.post("/review/:id/reject", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await rejectReviewPlane(request.auth!.tenantId, id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { rejected: true, item: row };
  });
}
