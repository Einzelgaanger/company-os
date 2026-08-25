import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import {
  addHolidayPlane,
  deleteHolidayPlane,
  listHolidaysPlane,
} from "../store/tenantPlane.js";
import { ensureSeedUsers } from "../store/memory.js";

const holidayBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(120),
});

export async function holidayRoutes(app: FastifyInstance) {
  bindRoute("/settings/holidays", "GET", "compliance.attest");
  bindRoute("/settings/holidays", "POST", "compliance.attest");
  bindRoute("/settings/holidays/:id", "DELETE", "compliance.attest");

  app.get("/settings/holidays", { preHandler: [app.authenticate] }, async (request) => {
    await ensureSeedUsers();
    return { items: await listHolidaysPlane(request.auth!.tenantId) };
  });

  app.post("/settings/holidays", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = holidayBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const row = await addHolidayPlane({
      tenantId: request.auth!.tenantId,
      date: parsed.data.date,
      name: parsed.data.name,
    });
    return reply.code(201).send(row);
  });

  app.delete<{ Params: { id: string } }>(
    "/settings/holidays/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const ok = await deleteHolidayPlane(request.auth!.tenantId, request.params.id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    },
  );
}
