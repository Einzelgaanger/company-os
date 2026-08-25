import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import { can, type AuthUser, type Role } from "@loop/shared";
import { ensureSeedUsers } from "../store/memory.js";
import { publishNoticeVersion } from "../store/legal.js";
import {
  getMessagingMetricsPlane,
  listMilestonesPlane,
  upsertMilestonePlane,
} from "../store/tenantPlane.js";
import { randomUUID } from "node:crypto";

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

/** Milestones, messaging metrics snapshot, notice publish. */
export async function parityRoutes(app: FastifyInstance) {
  bindRoute("/projects/:id/milestones", "GET", "project.view_team");
  bindRoute("/projects/:id/milestones", "POST", "milestone.manage");
  bindRoute("/messaging/metrics", "GET", "connection.org_manage");
  bindRoute("/compliance/notice/publish", "POST", "compliance.attest");

  app.get<{ Params: { id: string } }>(
    "/projects/:id/milestones",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "project.view_team", { scope: "team", inCallerTeam: true })) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await ensureSeedUsers();
      return {
        items: await listMilestonesPlane(req.auth.tenantId, req.params.id),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/projects/:id/milestones",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "milestone.manage", { scope: "team", inCallerTeam: true })) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const parsed = z
        .object({
          title: z.string().min(1),
          weight: z.number().optional(),
          status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      await ensureSeedUsers();
      const row = await upsertMilestonePlane({
        id: randomUUID(),
        tenantId: req.auth.tenantId,
        projectId: req.params.id,
        title: parsed.data.title,
        status: parsed.data.status ?? "pending",
        weight: parsed.data.weight ?? 1,
        dueDate: null,
      });
      return reply.code(201).send(row);
    },
  );

  app.get("/messaging/metrics", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    const user = toAuthUser(req.auth);
    if (!can(user, "connection.org_manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    await ensureSeedUsers();
    return getMessagingMetricsPlane(req.auth.tenantId);
  });

  app.post("/compliance/notice/publish", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    const user = toAuthUser(req.auth);
    if (!can(user, "compliance.attest")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = z.object({ version: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });
    await publishNoticeVersion(req.auth.tenantId, body.data.version);
    return { ok: true, version: body.data.version };
  });
}
