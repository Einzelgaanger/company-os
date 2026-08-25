import type { FastifyInstance } from "fastify";
import {
  HIGH_RISK_USE_PROHIBITED,
  MIN_SURVEY_N,
} from "@loop/shared";
import { bindRoute } from "../lib/policy.js";

/** C-1: Loop must never return per-person performance scores. */
export const C1_FORBIDDEN_MESSAGE =
  "Forbidden (C-1): Loop does not provide individual performance scores, rankings, or ratings. Loop coordinates work; it does not evaluate people.";

/** C-2: No sentiment value may be keyed to a user_id. */
export const C2_FORBIDDEN_MESSAGE = `Forbidden (C-2): Individual sentiment by userId is prohibited. Sentiment is aggregate-only (min n=${MIN_SURVEY_N}).`;

/**
 * Hard product guardrails — these routes exist so automated tests can prove
 * the forbidden surfaces always 403, even if a future caller tries to add them.
 */
export async function forbiddenGuardRoutes(app: FastifyInstance) {
  bindRoute("/performance/score", "POST", "guard.c1_performance_score");
  bindRoute("/sentiment/users/:userId", "GET", "guard.c2_individual_sentiment");

  app.post(
    "/performance/score",
    { preHandler: [app.authenticate] },
    async (_request, reply) => {
      return reply.code(403).send({
        error: "c1_performance_score_prohibited",
        message: C1_FORBIDDEN_MESSAGE,
        high_risk_use_prohibited: HIGH_RISK_USE_PROHIBITED,
      });
    },
  );

  app.get(
    "/sentiment/users/:userId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      return reply.code(403).send({
        error: "c2_individual_sentiment_prohibited",
        message: C2_FORBIDDEN_MESSAGE,
        userId,
      });
    },
  );
}
