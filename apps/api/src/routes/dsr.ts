import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import { can, type AuthUser, type Role } from "@loop/shared";
import {
  createDsrPlane,
  listDsrPlane,
  updateDsrPlane,
} from "../store/tenantPlane.js";
import { ensureSeedUsers } from "../store/memory.js";

function toAuthUser(auth: {
  userId: string;
  tenantId: string;
  role: string;
}): AuthUser {
  return {
    id: auth.userId,
    tenantId: auth.tenantId,
    role: auth.role as Role,
    managerId: null,
  };
}

const createBody = z.object({
  type: z.enum(["access", "erasure", "rectification", "objection"]),
  detail: z.string().nullable().optional(),
});

export async function dsrRoutes(app: FastifyInstance) {
  bindRoute("/dsr", "GET", "dsr.handle");
  bindRoute("/dsr", "POST", "dsr.submit");
  bindRoute("/dsr/:id", "PATCH", "dsr.handle");

  app.get("/dsr", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    const user = toAuthUser(req.auth);
    if (!can(user, "dsr.handle")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    await ensureSeedUsers();
    return { items: await listDsrPlane(req.auth.tenantId) };
  });

  app.post("/dsr", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    const user = toAuthUser(req.auth);
    if (!can(user, "dsr.submit")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    await ensureSeedUsers();
    const row = await createDsrPlane({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      type: parsed.data.type,
      detail: parsed.data.detail ?? null,
    });
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>(
    "/dsr/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "dsr.handle")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body = z
        .object({
          status: z.enum(["open", "in_progress", "fulfilled", "rejected"]),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_body" });
      const row = await updateDsrPlane(req.auth.tenantId, req.params.id, {
        status: body.data.status,
        resolvedAt:
          body.data.status === "fulfilled" || body.data.status === "rejected"
            ? new Date().toISOString()
            : null,
      });
      if (!row) return reply.code(404).send({ error: "not_found" });
      return row;
    },
  );
}
