import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { withTenantContext } from "@loop/db";

/**
 * Sets tenant from the authenticated session and runs work inside
 * withTenantContext (set_config app.current_tenant_id — never plain SET).
 */
async function tenantPlugin(app: FastifyInstance) {
  app.addHook(
    "preHandler",
    async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.auth?.tenantId) return;
      // Stash for handlers; actual DB work must go through runWithTenant().
      request.tenantId = request.auth.tenantId;
    },
  );

  app.decorate(
    "runWithTenant",
    async function runWithTenant<T>(
      request: FastifyRequest,
      fn: Parameters<typeof withTenantContext<T>>[1],
    ): Promise<T> {
      const tenantId = request.auth?.tenantId ?? request.tenantId;
      if (!tenantId) {
        throw new Error("tenant: missing tenant context on request");
      }
      return withTenantContext(tenantId, fn);
    },
  );
}

declare module "fastify" {
  interface FastifyRequest {
    tenantId?: string;
  }
  interface FastifyInstance {
    runWithTenant: <T>(
      request: FastifyRequest,
      fn: Parameters<typeof withTenantContext<T>>[1],
    ) => Promise<T>;
  }
}

export default fp(tenantPlugin, { name: "tenant", dependencies: ["auth"] });
