import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";

const lastSweepByTenant = new Map<string, { at: string; next: string }>();
const RATE_MS = 5 * 60 * 1000;

/** Admin-triggered server sweep (replaces browser EngineContext). */
export async function adminSweepRoutes(app: FastifyInstance) {
  bindRoute("/admin/sweeps/status", "GET", "connection.org_manage");
  bindRoute("/admin/sweeps/run", "POST", "connection.org_manage");

  app.get(
    "/admin/sweeps/status",
    { preHandler: [app.authenticate] },
    async (request) => {
      const tid = request.auth!.tenantId;
      const last = lastSweepByTenant.get(tid);
      return {
        lastRunAt: last?.at ?? null,
        nextDueAt: last?.next ?? null,
        notes: [
          "Sweeps run on apps/scheduler. This endpoint reports the last admin-triggered run.",
        ],
      };
    },
  );

  app.post(
    "/admin/sweeps/run",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const tid = request.auth!.tenantId;
      const prev = lastSweepByTenant.get(tid);
      if (prev && Date.now() - new Date(prev.at).getTime() < RATE_MS) {
        return reply.code(429).send({
          error: "rate_limited",
          message: "One sweep per five minutes per tenant",
        });
      }
      const ranAt = new Date().toISOString();
      const nextDueAt = new Date(Date.now() + RATE_MS).toISOString();
      lastSweepByTenant.set(tid, { at: ranAt, next: nextDueAt });
      // Enqueue would go to BullMQ; acknowledge immediately for A1.
      return {
        ranAt,
        nextDueAt,
        notes: ["Sweep accepted — scheduler/workers will process check-ins and escalations."],
      };
    },
  );
}
