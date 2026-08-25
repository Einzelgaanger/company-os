import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import { can, type AuthUser, type Role } from "@loop/shared";
import { revokeSessionsForUser } from "../plugins/auth.js";
import { findUserById } from "../store/memory.js";

/**
 * Phase 4 — SCIM-ish deprovision (WorkOS wiring later).
 * Idempotent: repeated active:false is a no-op success.
 */
const deprovisioned = new Map<
  string,
  { at: string; tenantId: string; userId: string }
>();

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

export async function scimRoutes(app: FastifyInstance) {
  bindRoute("/scim/v2/Users/:id", "PATCH", "sso.manage");
  app.patch<{
    Params: { id: string };
    Body: { active?: boolean; schemas?: string[] };
  }>(
    "/scim/v2/Users/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "sso.manage")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const externalId = req.params.id;
      const key = `${req.auth.tenantId}:${externalId}`;
      const loopUserId = findUserById(externalId)?.id ?? externalId;

      if (req.body?.active === false) {
        const already = deprovisioned.has(key);
        if (!already) {
          deprovisioned.set(key, {
            at: new Date().toISOString(),
            tenantId: req.auth.tenantId,
            userId: loopUserId,
          });
        }
        const revoked = await revokeSessionsForUser(
          req.auth.tenantId,
          loopUserId,
        );
        return {
          id: externalId,
          active: false,
          idempotent: already,
          sessionsRevoked: revoked,
        };
      }

      return reply.code(400).send({ error: "unsupported_patch" });
    },
  );

  bindRoute("/scim/v2/Users/:id", "GET", "sso.manage");
  app.get<{ Params: { id: string } }>(
    "/scim/v2/Users/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "sso.manage")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const key = `${req.auth.tenantId}:${req.params.id}`;
      const rec = deprovisioned.get(key);
      return {
        id: req.params.id,
        active: !rec,
        deprovisionedAt: rec?.at ?? null,
      };
    },
  );
}

export function __scimResetForTests(): void {
  deprovisioned.clear();
}
