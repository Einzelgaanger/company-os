import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { readNoticeAck, readTenantStatus } from "../store/legal.js";

/**
 * A3 — a tenant still in `provisioning` has not completed the legal gate, so it
 * may not invite people, connect a source of employee data, or send a message.
 * Enforced here rather than in handlers: a new route cannot forget the gate,
 * it has to be added to GATED_ROUTES to be reachable at all.
 */
const GATED_ROUTES: ReadonlySet<string> = new Set([
  "POST /invites",
  "POST /connections/:provider/connect",
  "POST /messaging/send",
]);

/** Sends also require the individual transparency notice to be acknowledged. */
const NOTICE_REQUIRED_ROUTES: ReadonlySet<string> = new Set(["POST /messaging/send"]);

function routeKey(req: FastifyRequest): string | null {
  const pattern = req.routeOptions?.url;
  if (!pattern) return null;
  return `${req.method.toUpperCase()} ${pattern}`;
}

export function isProvisioningGated(method: string, pattern: string): boolean {
  return GATED_ROUTES.has(`${method.toUpperCase()} ${pattern}`);
}

async function provisioningPlugin(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const key = routeKey(req);
    if (!key || !GATED_ROUTES.has(key)) return;
    if (!req.auth) return; // authz middleware already answered 401

    const status = await readTenantStatus(req.auth.tenantId);
    if (status === "provisioning") {
      return reply.code(409).send({
        error: "tenant_provisioning",
        message:
          "This workspace is still provisioning. Complete the compliance attestation before inviting people, connecting sources, or sending messages.",
      });
    }

    if (NOTICE_REQUIRED_ROUTES.has(key)) {
      const ack = await readNoticeAck(req.auth.tenantId, req.auth.userId);
      if (!ack) {
        return reply.code(409).send({
          error: "notice_not_acknowledged",
          message:
            "The transparency notice has not been acknowledged for this account.",
        });
      }
    }
  });
}

export default fp(provisioningPlugin, {
  name: "provisioning",
  dependencies: ["auth"],
});
