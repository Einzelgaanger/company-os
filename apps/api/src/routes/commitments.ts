import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { commitmentFlowTimeline } from "@loop/shared";
import { bindRoute } from "../lib/policy.js";
import { storeMode } from "../store/index.js";
import {
  createCommitment,
  deleteCommitment,
  ensureSeedUsers,
  getCommitment,
  getTenantTimeSettings,
  listCommitments,
  listFlowEvents,
  updateCommitment,
} from "../store/memory.js";
import { pgCreateCommitment, pgEnsureDemoSeed, pgListCommitments } from "../store/pg.js";
import { withTenantContext, schema } from "@loop/db";
import { and, eq } from "drizzle-orm";

const createBody = z.object({
  title: z.string().min(3).max(200),
  projectId: z.string().uuid().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const patchBody = z.object({
  title: z.string().min(3).max(200).optional(),
  status: z
    .enum(["open", "in_progress", "at_risk", "overdue", "escalated", "done", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

function mapPgCommitment(row: typeof schema.commitments.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    projectId: row.projectId,
    ownerUserId: row.ownerUserId,
    status: row.status,
    needsReview: row.reviewRequired,
    priority: row.priority,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

/** Commitments CRUD — Postgres when DATABASE_URL set; memory for vitest. */
export async function commitmentRoutes(app: FastifyInstance) {
  bindRoute("/commitments", "GET", "commitment.read");
  bindRoute("/commitments", "POST", "commitment.create");
  bindRoute("/commitments/:id", "GET", "commitment.read");
  bindRoute("/commitments/:id/flow", "GET", "commitment.read");
  bindRoute("/commitments/:id", "PATCH", "commitment.update_own");
  bindRoute("/commitments/:id", "DELETE", "commitment.delete");

  app.get(
    "/commitments",
    { preHandler: [app.authenticate] },
    async (request) => {
      const tenantId = request.auth!.tenantId;
      if (storeMode === "postgres") {
        await pgEnsureDemoSeed();
        const items = await pgListCommitments(tenantId);
        return { tenantId, items: items.map(mapPgCommitment) };
      }
      await ensureSeedUsers();
      return { tenantId, items: listCommitments(tenantId) };
    },
  );

  app.post(
    "/commitments",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      if (storeMode === "postgres") {
        const row = await pgCreateCommitment(request.auth!.tenantId, {
          title: parsed.data.title,
          ownerUserId: request.auth!.userId,
        });
        return reply.code(201).send(mapPgCommitment(row));
      }
      await ensureSeedUsers();
      const row = createCommitment({
        tenantId: request.auth!.tenantId,
        title: parsed.data.title,
        projectId: parsed.data.projectId ?? null,
        ownerUserId: request.auth!.userId,
        priority: parsed.data.priority ?? "medium",
      });
      return reply.code(201).send(row);
    },
  );

  app.get(
    "/commitments/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (storeMode === "postgres") {
        const row = await withTenantContext(request.auth!.tenantId, async (db) => {
          const [r] = await db
            .select()
            .from(schema.commitments)
            .where(
              and(
                eq(schema.commitments.id, id),
                eq(schema.commitments.tenantId, request.auth!.tenantId),
              ),
            );
          return r;
        });
        if (!row) return reply.code(404).send({ error: "not_found" });
        return mapPgCommitment(row);
      }
      const row = getCommitment(request.auth!.tenantId, id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return row;
    },
  );

  app.get(
    "/commitments/:id/flow",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.auth!.tenantId;
      if (storeMode === "postgres") {
        const { pgGetCommitment, pgListFlowEvents } = await import(
          "../store/pgTenant.js"
        );
        const row = await pgGetCommitment(tenantId, id);
        if (!row) return reply.code(404).send({ error: "not_found" });
        const events = await pgListFlowEvents(tenantId, id);
        const holidayRows = await import("../store/tenantPlane.js").then((m) =>
          m.listHolidaysPlane(tenantId),
        );
        return commitmentFlowTimeline({
          commitmentId: id,
          flowState: row.flowState,
          flowStateSince:
            row.flowStateSince?.toISOString?.() ??
            String(row.flowStateSince ?? row.createdAt),
          events: events.map((e) => ({
            commitmentId: e.commitmentId,
            fromState: e.fromState,
            toState: e.toState,
            createdAt: e.createdAt,
          })),
          settings: {
            ...getTenantTimeSettings(tenantId),
            holidays: holidayRows.map((h) => h.date),
          },
        });
      }
      await ensureSeedUsers();
      const row = getCommitment(tenantId, id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      const events = listFlowEvents(tenantId).filter((e) => e.commitmentId === id);
      return commitmentFlowTimeline({
        commitmentId: id,
        flowState: row.flowState,
        flowStateSince: row.flowStateSince,
        events,
        settings: getTenantTimeSettings(tenantId),
      });
    },
  );

  app.patch(
    "/commitments/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      if (storeMode === "postgres") {
        const row = await withTenantContext(request.auth!.tenantId, async (db) => {
          const [r] = await db
            .update(schema.commitments)
            .set({
              ...(parsed.data.title ? { title: parsed.data.title } : {}),
              ...(parsed.data.status ? { status: parsed.data.status } : {}),
              ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.commitments.id, id),
                eq(schema.commitments.tenantId, request.auth!.tenantId),
              ),
            )
            .returning();
          return r;
        });
        if (!row) return reply.code(404).send({ error: "not_found" });
        return mapPgCommitment(row);
      }
      const row = updateCommitment(request.auth!.tenantId, id, parsed.data);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return row;
    },
  );

  app.delete(
    "/commitments/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (storeMode === "postgres") {
        const ok = await withTenantContext(request.auth!.tenantId, async (db) => {
          const rows = await db
            .delete(schema.commitments)
            .where(
              and(
                eq(schema.commitments.id, id),
                eq(schema.commitments.tenantId, request.auth!.tenantId),
              ),
            )
            .returning({ id: schema.commitments.id });
          return rows.length > 0;
        });
        if (!ok) return reply.code(404).send({ error: "not_found" });
        return reply.code(204).send();
      }
      const ok = deleteCommitment(request.auth!.tenantId, id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    },
  );
}
