import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import {
  decideMessage,
  enqueueMessageApproval,
  readMessageApprovals,
} from "../store/legal.js";

const sendBody = z.object({
  templateKey: z.string().min(1),
  preview: z.string().min(1),
  recipientUserId: z.string().uuid().optional(),
});

const decideBody = z.object({ approved: z.boolean() });

/**
 * A3 — outbound sends are queued into `message_approvals` (pilot manual approve).
 * Provisioning tenants and accounts without a notice acknowledgement are stopped
 * by the provisioning plugin before this handler runs.
 */
export async function messagingRoutes(app: FastifyInstance) {
  bindRoute("/messaging/send", "POST", "messaging.send");
  bindRoute("/messaging/approvals", "GET", "messaging.approve");
  bindRoute("/messaging/approvals/:id/decide", "POST", "messaging.approve");

  app.post("/messaging/send", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    const parsed = sendBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const row = await enqueueMessageApproval({
      tenantId: req.auth.tenantId,
      templateKey: parsed.data.templateKey,
      preview: parsed.data.preview,
      recipientUserId: parsed.data.recipientUserId ?? null,
      requestedByUserId: req.auth.userId,
    });
    return reply.code(202).send({ queued: true, approval: row });
  });

  app.get(
    "/messaging/approvals",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      return { items: await readMessageApprovals(req.auth.tenantId) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/messaging/approvals/:id/decide",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const parsed = decideBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      const row = await decideMessage(
        req.auth.tenantId,
        req.params.id,
        parsed.data.approved,
        req.auth.userId,
      );
      if (!row) return reply.code(404).send({ error: "not_found" });
      return row;
    },
  );
}
