import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import {
  createExclusionPlane,
  deleteExclusionPlane,
  listExclusionsPlane,
} from "../store/tenantPlane.js";
import { ensureSeedUsers } from "../store/memory.js";

const createBody = z.object({
  scope: z.enum(["user", "meeting", "keyword", "domain"]),
  matchValue: z.string().min(1).max(500),
  reason: z.string().max(500).optional(),
});

export async function exclusionRoutes(app: FastifyInstance) {
  bindRoute("/ingestion/exclusions", "GET", "ingestion_exclusion.manage");
  bindRoute("/ingestion/exclusions", "POST", "ingestion_exclusion.manage");
  bindRoute("/ingestion/exclusions/:id", "DELETE", "ingestion_exclusion.manage");

  app.get("/ingestion/exclusions", { preHandler: [app.authenticate] }, async (request) => {
    await ensureSeedUsers();
    return { items: await listExclusionsPlane(request.auth!.tenantId) };
  });

  app.post("/ingestion/exclusions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    await ensureSeedUsers();
    const row = await createExclusionPlane({
      tenantId: request.auth!.tenantId,
      scope: parsed.data.scope,
      matchValue: parsed.data.matchValue,
      reason: parsed.data.reason ?? null,
      createdByUserId: request.auth!.userId,
    });
    return reply.code(201).send(row);
  });

  app.delete<{ Params: { id: string } }>(
    "/ingestion/exclusions/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const ok = await deleteExclusionPlane(request.auth!.tenantId, request.params.id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    },
  );
}
