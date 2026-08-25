import Fastify from "fastify";
import cors from "@fastify/cors";
import authPlugin from "./plugins/auth.js";
import tenantPlugin from "./plugins/tenant.js";
import provisioningPlugin from "./plugins/provisioning.js";
import {
  assertAllRoutesBound,
  requireBoundAction,
  trackRoute,
} from "./lib/policy.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { commitmentRoutes } from "./routes/commitments.js";
import { flowRoutes } from "./routes/flow.js";
import { forbiddenGuardRoutes } from "./routes/forbidden.js";
import { onboardingComplianceRoutes } from "./routes/onboarding-compliance.js";
import { projectRoutes } from "./routes/projects.js";
import { surveyRoutes } from "./routes/surveys.js";
import { scimRoutes } from "./routes/scim.js";
import { emailIngestRoutes } from "./routes/emailIngest.js";
import { reviewRoutes } from "./routes/review.js";
import { connectionRoutes } from "./routes/connections.js";
import { inviteRoutes } from "./routes/invites.js";
import { messagingRoutes } from "./routes/messaging.js";
import { noticeRoutes } from "./routes/notice.js";
import { dsrRoutes } from "./routes/dsr.js";
import { parityRoutes } from "./routes/parity.js";
import { adminSweepRoutes } from "./routes/adminSweeps.js";
import { exclusionRoutes } from "./routes/exclusions.js";
import { holidayRoutes } from "./routes/holidays.js";
import { nudgeQualityRoutes } from "./routes/nudgeQuality.js";
import { reportRoutes } from "./routes/reports.js";
import { launchRoutes } from "./routes/launch.js";
import { ssoRoutes } from "./routes/sso.js";
import { meRoutes } from "./routes/me.js";
import { extractTraceId } from "@loop/shared";

function corsOrigin() {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    throw new Error(
      "CORS_ORIGINS is required (comma-separated allowlist). Refusing open CORS.",
    );
  }
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) {
    throw new Error("CORS_ORIGINS allowlist is empty.");
  }
  return list;
}

/** Build configured Fastify app (shared by listen + inject tests). */
export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : true,
  });

  app.addHook("onRoute", (route) => {
    const path = route.url ?? route.path;
    if (!route.method || !path) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      trackRoute(path, method);
    }
  });

  app.addHook("onRequest", async (req, reply) => {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const traceId = extractTraceId(headers);
    req.headers["x-trace-id"] = traceId;
    reply.header("x-trace-id", traceId);
  });

  // Enforce can() for every bound route. Delete this hook and authz.spec must fail.
  app.addHook("preHandler", requireBoundAction);

  await app.register(cors, {
    origin: corsOrigin(),
    credentials: true,
  });
  await app.register(authPlugin);
  await app.register(tenantPlugin);
  await app.register(provisioningPlugin);

  await healthRoutes(app);
  await authRoutes(app);
  await commitmentRoutes(app);
  await flowRoutes(app);
  await projectRoutes(app);
  await reviewRoutes(app);
  await surveyRoutes(app);
  await connectionRoutes(app);
  await inviteRoutes(app);
  await messagingRoutes(app);
  await noticeRoutes(app);
  await dsrRoutes(app);
  await parityRoutes(app);
  await adminSweepRoutes(app);
  await exclusionRoutes(app);
  await holidayRoutes(app);
  await nudgeQualityRoutes(app);
  await reportRoutes(app);
  await launchRoutes(app);
  await ssoRoutes(app);
  await meRoutes(app);
  await scimRoutes(app);
  await emailIngestRoutes(app);
  await forbiddenGuardRoutes(app);
  await onboardingComplianceRoutes(app);

  await app.ready();
  assertAllRoutesBound();
  return app;
}
