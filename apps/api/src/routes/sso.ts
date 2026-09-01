import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import {
  buildWorkosAuthorizeUrl,
  exchangeWorkosCode,
  verifyWorkosState,
  workosConfigured,
  workosSpaErrorRedirect,
  workosSpaRedirect,
} from "../lib/workos.js";
import { createSession } from "../plugins/auth.js";
import {
  ensureSeedUsers,
  findUserByEmail,
} from "../store/memory.js";

/**
 * WorkOS SSO — authorize + callback. Missing env → 503, never fake login.
 */
export async function ssoRoutes(app: FastifyInstance) {
  bindRoute("/auth/sso/status", "GET", "public.auth.login");
  bindRoute("/auth/sso/authorize", "GET", "public.auth.login");
  bindRoute("/auth/sso/callback", "GET", "public.auth.login");

  app.get("/auth/sso/status", async () => ({
    configured: workosConfigured(),
    missing: workosConfigured()
      ? []
      : ["WORKOS_API_KEY", "WORKOS_CLIENT_ID"].filter((k) => !process.env[k]?.trim()),
  }));

  app.get<{ Querystring: { organization?: string } }>(
    "/auth/sso/authorize",
    async (req, reply) => {
      if (!workosConfigured()) {
        return reply.code(503).send({
          error: "workos_not_configured",
          missing: ["WORKOS_API_KEY", "WORKOS_CLIENT_ID"],
        });
      }
      try {
        const { authUrl } = await buildWorkosAuthorizeUrl({
          organizationId: req.query.organization,
        });
        return { authUrl };
      } catch (e) {
        return reply.code(503).send({
          error: e instanceof Error ? e.message : "workos_error",
        });
      }
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/sso/callback",
    async (req, reply) => {
      if (req.query.error) {
        return reply.redirect(workosSpaErrorRedirect(req.query.error));
      }
      if (!req.query.code || !req.query.state) {
        return reply.redirect(workosSpaErrorRedirect("missing_code"));
      }
      const st = await verifyWorkosState(req.query.state);
      if (!st) return reply.redirect(workosSpaErrorRedirect("invalid_state"));

      try {
        const profile = await exchangeWorkosCode(req.query.code);
        await ensureSeedUsers();
        let user = findUserByEmail(profile.email);
        if (!user) {
          // JIT: only attach to an existing demo tenant user email for now;
          // production should provision via SCIM. Refuse unknown emails.
          return reply.redirect(workosSpaErrorRedirect("user_not_provisioned"));
        }
        const session = await createSession({
          userId: user.id,
          tenantId: user.tenantId,
          role: user.role,
        });
        // Pass tokens via hash fragment would be ideal; SPA picks them from query once.
        const url = new URL(workosSpaRedirect());
        url.searchParams.set("accessToken", session.accessToken);
        url.searchParams.set("refreshToken", session.refreshToken);
        return reply.redirect(url.toString());
      } catch (e) {
        const msg = e instanceof Error ? e.message : "sso_failed";
        return reply.redirect(workosSpaErrorRedirect(msg));
      }
    },
  );

  bindRoute("/settings/sso", "GET", "compliance.attest");
  app.get("/settings/sso", { preHandler: [app.authenticate] }, async () => ({
    configured: workosConfigured(),
    directorySync: "POST /webhooks/workos when WORKOS_WEBHOOK_SECRET is set",
    usersHint: "SCIM deprovision remains at /scim/v2/Users",
  }));

  bindRoute("/webhooks/workos", "POST", "public.auth.login");
  app.post("/webhooks/workos", async (req, reply) => {
    const secret = process.env.WORKOS_WEBHOOK_SECRET?.trim();
    if (!secret) return reply.code(503).send({ error: "workos_webhook_not_configured" });
    const raw = JSON.stringify(req.body ?? {});
    const sig = (req.headers["workos-signature"] as string) ?? "";
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (!sig.includes(expected.slice(0, 16))) {
      return reply.code(401).send({ error: "invalid_signature" });
    }
    const event = req.body as { event?: string; data?: { email?: string; first_name?: string; last_name?: string } };
    const type = event.event ?? "";
    if (type.includes("user.created")) {
      const email = event.data?.email;
      if (email && !findUserByEmail(email)) {
        const tenantId = process.env.WORKOS_DEFAULT_TENANT_ID ?? "tenant-demo";
        await ensureSeedUsers();
        req.log.info({ email, tenantId }, "workos_user_created_needs_provision");
      }
    }
    if (type.includes("user.deleted") && event.data?.email) {
      const user = findUserByEmail(event.data.email);
      if (user) req.log.info({ userId: user.id }, "workos_user_deleted_disable");
    }
    return { ok: true };
  });
}
