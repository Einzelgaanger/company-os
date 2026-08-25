import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import {
  createInvitePlane,
  listInvitesPlane,
} from "../store/tenantPlane.js";

const body = z.object({
  email: z.string().email(),
  role: z.enum(["member", "manager", "admin"]),
});

export async function inviteRoutes(app: FastifyInstance) {
  bindRoute("/invites", "GET", "invite.create");
  bindRoute("/invites", "POST", "invite.create");

  app.get("/invites", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    return { items: await listInvitesPlane(req.auth.tenantId) };
  });

  app.post("/invites", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const row = await createInvitePlane({
      tenantId: req.auth.tenantId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedByUserId: req.auth.userId,
    });
    return reply.code(201).send(row);
  });
}
