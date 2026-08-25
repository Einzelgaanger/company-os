import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import { ensureSeedUsers } from "../store/memory.js";
import { storeMode } from "../store/index.js";
import {
  listNudgeTriggersPlane,
  setNudgeSuspendedPlane,
} from "../store/tenantPlane.js";

type TriggerRow = {
  id: string;
  name: string;
  precision: number | null;
  suspended: boolean;
  sends7d: number;
};

const triggersByTenant = new Map<string, TriggerRow[]>();

function seedTriggers(tenantId: string): TriggerRow[] {
  if (!triggersByTenant.has(tenantId)) {
    triggersByTenant.set(tenantId, [
      {
        id: "checkin_evidence",
        name: "Evidence check-in",
        precision: null,
        suspended: false,
        sends7d: 0,
      },
      {
        id: "unblock_request",
        name: "Unblock request",
        precision: null,
        suspended: false,
        sends7d: 0,
      },
    ]);
  }
  return triggersByTenant.get(tenantId)!;
}

/** B5 — nudge quality; precision appears after real feedback loops. */
export async function nudgeQualityRoutes(app: FastifyInstance) {
  bindRoute("/settings/nudge-quality", "GET", "connection.org_manage");
  bindRoute("/settings/nudge-quality/:id/suspend", "POST", "connection.org_manage");
  bindRoute("/settings/nudge-quality/:id/resume", "POST", "connection.org_manage");

  app.get(
    "/settings/nudge-quality",
    { preHandler: [app.authenticate] },
    async (request) => {
      await ensureSeedUsers();
      const fromPg = await listNudgeTriggersPlane(request.auth!.tenantId);
      const triggers = fromPg ?? seedTriggers(request.auth!.tenantId);
      return {
        note: "Precision tracking starts after check-ins collect YES/NO nudge_feedback. Triggers below 0.70 auto-suspend once measured.",
        autoSuspendThreshold: 0.7,
        triggers,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/settings/nudge-quality/:id/suspend",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (storeMode === "postgres") {
        const row = await setNudgeSuspendedPlane(
          request.auth!.tenantId,
          request.params.id,
          true,
        );
        if (!row) return reply.code(404).send({ error: "not_found" });
        return row;
      }
      const list = seedTriggers(request.auth!.tenantId);
      const row = list.find((t) => t.id === request.params.id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      row.suspended = true;
      return row;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/settings/nudge-quality/:id/resume",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (storeMode === "postgres") {
        const row = await setNudgeSuspendedPlane(
          request.auth!.tenantId,
          request.params.id,
          false,
        );
        if (!row) return reply.code(404).send({ error: "not_found" });
        return row;
      }
      const list = seedTriggers(request.auth!.tenantId);
      const row = list.find((t) => t.id === request.params.id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      row.suspended = false;
      return row;
    },
  );
}
