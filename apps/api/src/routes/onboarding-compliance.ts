import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import { readCompliance, writeCompliance } from "../store/legal.js";

const attestBody = z.object({
  lawfulBasis: z.enum([
    "legitimate_interest",
    "contract",
    "legal_obligation",
  ]),
  dpiaCompleted: z.literal(true),
  dpiaDocumentUrl: z.string().url().optional(),
  liaCompleted: z.boolean(),
  worksCouncilRequired: z.boolean(),
  worksCouncilConsulted: z.boolean(),
  employeeNoticePublished: z.literal(true),
  employeeNoticeVersion: z.string().min(1),
  dpoName: z.string().min(1).optional(),
  dpoEmail: z.string().email(),
  acknowledgedNotForHrDecisions: z.literal(true),
});

export async function onboardingComplianceRoutes(app: FastifyInstance) {
  bindRoute("/onboarding/compliance/attest", "POST", "compliance.attest");
  bindRoute("/onboarding/compliance", "GET", "compliance.attest");

  app.get(
    "/onboarding/compliance",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const row = await readCompliance(request.auth!.tenantId);
      if (!row) return reply.code(404).send({ error: "not_attested" });
      return row;
    },
  );

  app.post(
    "/onboarding/compliance/attest",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = attestBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_body",
          details: parsed.error.flatten(),
        });
      }

      if (
        parsed.data.worksCouncilRequired &&
        !parsed.data.worksCouncilConsulted
      ) {
        return reply.code(400).send({
          error: "works_council_required",
          message:
            "Works council / employee representatives must be consulted where required.",
        });
      }

      const row = await writeCompliance({
        tenantId: request.auth!.tenantId,
        userId: request.auth!.userId,
        payload: parsed.data,
      });

      return reply.code(201).send(row);
    },
  );
}
