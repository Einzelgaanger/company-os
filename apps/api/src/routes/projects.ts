import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import {
  can,
  projectProgress,
  projectHealth,
  formatProgressLabel,
  type AuthUser,
  type ProjectCommitmentInput,
  type MilestoneInput,
  type Role,
} from "@loop/shared";
import { ensureSeedUsers, listCommitments } from "../store/memory.js";
import { storeMode } from "../store/index.js";
import { pgListCommitments } from "../store/pg.js";

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

/**
 * Phase 2 — project progress/health (08 §8.2). Numbers computed in code, never invented by a model.
 */
export async function projectRoutes(app: FastifyInstance) {
  bindRoute("/projects/:id/progress", "GET", "project.view_team");
  app.get<{ Params: { id: string } }>(
    "/projects/:id/progress",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "project.view_team", { scope: "team", inCallerTeam: true })) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await ensureSeedUsers();
      const raw =
        storeMode === "postgres"
          ? await pgListCommitments(req.auth.tenantId)
          : listCommitments(req.auth.tenantId);
      const commitments: ProjectCommitmentInput[] = raw
        .filter((c) => {
          const projectId = "projectId" in c ? c.projectId : null;
          return (
            !req.params.id ||
            projectId === req.params.id ||
            projectId == null
          );
        })
        .map((c) => ({
          id: c.id,
          status: c.status as ProjectCommitmentInput["status"],
          progressPct: null,
          priority: c.priority as ProjectCommitmentInput["priority"],
          reviewRequired:
            "reviewRequired" in c
              ? Boolean(c.reviewRequired)
              : Boolean((c as { needsReview?: boolean }).needsReview),
        }));

      const progress = projectProgress(commitments);
      const health = projectHealth(commitments, {
        progressPct: progress.pct,
      });
      return {
        projectId: req.params.id,
        progressPct: progress.pct,
        lowConfidence: progress.lowConfidence,
        method: progress.method,
        label: formatProgressLabel(progress.pct, progress.lowConfidence),
        health,
      };
    },
  );

  bindRoute("/projects/:id/progress/compute", "POST", "project.view_team");
  app.post<{
    Params: { id: string };
    Body: {
      commitments: ProjectCommitmentInput[];
      milestones?: MilestoneInput[];
      targetEndDate?: string | null;
    };
  }>(
    "/projects/:id/progress/compute",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "project.view_team", { scope: "team", inCallerTeam: true })) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const { commitments, milestones = [], targetEndDate } = req.body ?? {
        commitments: [],
      };
      const progress = projectProgress(commitments ?? [], milestones);
      const health = projectHealth(commitments ?? [], {
        targetEndDate,
        progressPct: progress.pct,
      });
      return {
        projectId: req.params.id,
        progressPct: progress.pct,
        lowConfidence: progress.lowConfidence,
        method: progress.method,
        label: formatProgressLabel(progress.pct, progress.lowConfidence),
        health,
      };
    },
  );
}
