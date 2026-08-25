import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import { readNoticeAck, writeNoticeAck } from "../store/legal.js";

const body = z.object({
  version: z.string().min(1),
});

/**
 * C-3 individual transparency notice acknowledgement.
 * Persisted to `users.notice_acknowledged_at` — never to browser storage.
 */
export async function noticeRoutes(app: FastifyInstance) {
  bindRoute("/onboarding/notice/ack", "POST", "my_data.view");
  bindRoute("/onboarding/notice", "GET", "my_data.view");

  app.get(
    "/onboarding/notice",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const row = await readNoticeAck(req.auth.tenantId, req.auth.userId);
      if (!row) return reply.code(404).send({ error: "not_acknowledged" });
      return row;
    },
  );

  app.post(
    "/onboarding/notice/ack",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const parsed = body.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      const row = await writeNoticeAck(
        req.auth.tenantId,
        req.auth.userId,
        parsed.data.version,
      );
      return reply.code(201).send(row);
    },
  );
}
