import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import {
  assertEmailIngestionEnabled,
  resolveFeatureFlags,
} from "@loop/shared";

/**
 * Phase 7 — email ingest entrypoint, hard-gated off by default (C-5).
 */
export async function emailIngestRoutes(app: FastifyInstance) {
  bindRoute("/ingest/email", "POST", "connection.org_manage");
  app.post(
    "/ingest/email",
    { preHandler: [app.authenticate] },
    async (_req, reply) => {
      const flags = resolveFeatureFlags();
      try {
        assertEmailIngestionEnabled(flags);
      } catch (err) {
        return reply.code(403).send({
          error: "email_ingestion_disabled",
          message: err instanceof Error ? err.message : "disabled",
        });
      }
      return reply.code(501).send({
        status: "not_implemented",
        note: "Flag on — wire provider after CASA LoA",
      });
    },
  );

  bindRoute("/flags", "GET", "commitment.read_own");
  app.get("/flags", { preHandler: [app.authenticate] }, async () => {
    return resolveFeatureFlags();
  });
}
