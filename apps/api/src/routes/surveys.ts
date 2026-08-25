import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import {
  can,
  aggregateSurveyThemes,
  assertNoIndividualSentiment,
  assertNoPerformanceScore,
  type AuthUser,
  type Role,
} from "@loop/shared";
import { ensureSeedUsers } from "../store/memory.js";
import {
  getCurrentSurveyPlane,
  getSurveyCyclePlane,
  getSurveyReviewPlane,
  listSurveyCyclesPlane,
  reviewSurveyQuestionPlane,
  submitSurveyAnswerPlane,
} from "../store/tenantPlane.js";

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

/** Phase 5 — survey aggregates only (C-2). */
export async function surveyRoutes(app: FastifyInstance) {
  bindRoute("/surveys", "GET", "report.view_team");
  app.get(
    "/surveys",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "report.view_team", { scope: "team", inCallerTeam: true })) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await ensureSeedUsers();
      const cycles = (await listSurveyCyclesPlane(req.auth.tenantId)).map((c) => {
        const agg = aggregateSurveyThemes(c.responses);
        return {
          id: c.id,
          title: c.title,
          closedAt: c.closedAt,
          responseCount: c.responses.length,
          suppressed: !agg.ok,
          themes: agg.ok ? agg.themes : null,
          message: agg.ok ? undefined : agg.message,
        };
      });
      return { items: cycles };
    },
  );

  bindRoute("/surveys/:cycleId/aggregate", "GET", "report.view_team");
  app.get<{ Params: { cycleId: string } }>(
    "/surveys/:cycleId/aggregate",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "report.view_team", { scope: "team", inCallerTeam: true })) {
        return reply.code(403).send({ error: "forbidden" });
      }

      await ensureSeedUsers();
      const cycle = await getSurveyCyclePlane(req.auth.tenantId, req.params.cycleId);
      if (!cycle) return reply.code(404).send({ error: "not_found" });

      const result = aggregateSurveyThemes(cycle.responses);
      assertNoIndividualSentiment(result);
      assertNoPerformanceScore(result);

      if (!result.ok) {
        return {
          cycleId: req.params.cycleId,
          title: cycle.title,
          suppressed: true,
          ...result,
        };
      }
      return {
        cycleId: req.params.cycleId,
        title: cycle.title,
        suppressed: false,
        ...result,
      };
    },
  );

  bindRoute("/surveys/current", "GET", "my_data.view");
  app.get("/surveys/current", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    await ensureSeedUsers();
    const cycle = await getCurrentSurveyPlane(req.auth.tenantId);
    if (!cycle) return reply.code(404).send({ error: "no_live_survey" });
    return {
      id: cycle.id,
      title: cycle.title,
      status: cycle.status,
      questions: cycle.questions,
    };
  });

  bindRoute("/surveys/current/answer", "POST", "my_data.view");
  app.post("/surveys/current/answer", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    await ensureSeedUsers();
    const cycle = await getCurrentSurveyPlane(req.auth.tenantId);
    if (!cycle) return reply.code(404).send({ error: "no_live_survey" });
    const body = (req.body ?? {}) as {
      answers?: unknown;
      themeTags?: string[];
    };
    const themeTags = Array.isArray(body.themeTags)
      ? body.themeTags.map(String)
      : Array.isArray(body.answers)
        ? ["answered"]
        : ["answered"];
    if (body.answers === undefined && !body.themeTags) {
      return reply.code(400).send({ error: "answers_required" });
    }
    await submitSurveyAnswerPlane(
      req.auth.tenantId,
      cycle.id,
      themeTags,
      body.answers ?? body.themeTags,
      req.auth.userId,
    );
    return reply.code(201).send({ ok: true, cycleId: cycle.id, stored: true });
  });

  bindRoute("/surveys/:cycleId/review", "GET", "survey.approve");
  app.get<{ Params: { cycleId: string } }>(
    "/surveys/:cycleId/review",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "survey.approve")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await ensureSeedUsers();
      const cycle = await getSurveyReviewPlane(
        req.auth.tenantId,
        req.params.cycleId,
      );
      if (!cycle) return reply.code(404).send({ error: "not_found" });
      return {
        id: cycle.id,
        title: cycle.title,
        status: cycle.status,
        questions: cycle.questions ?? [],
      };
    },
  );

  bindRoute("/surveys/:cycleId/review/:questionId", "POST", "survey.approve");
  app.post<{ Params: { cycleId: string; questionId: string } }>(
    "/surveys/:cycleId/review/:questionId",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "survey.approve")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const approved = Boolean((req.body as { approved?: boolean })?.approved);
      const cycle = await reviewSurveyQuestionPlane(
        req.auth.tenantId,
        req.params.cycleId,
        req.params.questionId,
        approved,
        req.auth.userId,
      );
      if (!cycle) return reply.code(404).send({ error: "not_found" });
      return cycle;
    },
  );
}
