import type { FastifyInstance } from "fastify";
import {
  can,
  connectionHealthFromSync,
  type AuthUser,
  type Role,
} from "@loop/shared";
import { bindRoute } from "../lib/policy.js";
import {
  appBaseUrl,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  oauthEnvStatus,
  verifyOAuthState,
  type OAuthProvider,
} from "../lib/oauth.js";
import { encryptToken, tokenEncryptionConfigured } from "../lib/tokenCrypto.js";
import { ensureSeedUsers } from "../store/memory.js";
import {
  disconnectConnectionPlane,
  listConnectionsPlane,
  upsertConnectionPlane,
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

const OAUTH_PROVIDERS = new Set<string>([
  "google_calendar",
  "microsoft_calendar",
  "gmail",
  "outlook",
]);

export async function connectionRoutes(app: FastifyInstance) {
  bindRoute("/connections", "GET", "connection.own");
  app.get(
    "/connections",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      await ensureSeedUsers();
      return {
        items: await listConnectionsPlane(req.auth.tenantId),
      };
    },
  );

  bindRoute("/connections/health", "GET", "connection.own");
  app.get(
    "/connections/health",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const user = toAuthUser(req.auth);
      if (!can(user, "connection.own") && !can(user, "connection.org_manage")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await ensureSeedUsers();
      const items = (await listConnectionsPlane(req.auth.tenantId)).map((c) =>
        connectionHealthFromSync(c.id, c.provider, c.status, c.lastSyncedAt),
      );
      return { items, alerts: items.filter((i) => i.alert) };
    },
  );

  bindRoute("/connections/:provider/authorize", "GET", "connection.own");
  app.get<{ Params: { provider: string } }>(
    "/connections/:provider/authorize",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const provider = req.params.provider as OAuthProvider;
      if (!OAUTH_PROVIDERS.has(provider)) {
        return reply.code(400).send({ error: "unknown_provider" });
      }
      const env = oauthEnvStatus(provider);
      if (!env.configured) {
        return reply.code(503).send({
          error: "oauth_not_configured",
          provider,
          missing: env.missing,
        });
      }
      if (!tokenEncryptionConfigured()) {
        return reply.code(503).send({
          error: "token_encryption_not_configured",
          missing: ["TOKEN_ENCRYPTION_KEY or KMS_KEY_ID"],
        });
      }
      try {
        const { authUrl, state } = await buildAuthorizeUrl({
          provider,
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
        });
        return { authUrl, state, provider };
      } catch (e) {
        const err = e as Error & { missing?: string[] };
        if (err.message === "oauth_not_configured") {
          return reply.code(503).send({
            error: "oauth_not_configured",
            provider,
            missing: err.missing ?? [],
          });
        }
        throw e;
      }
    },
  );

  // Public callback — state JWT carries tenant/user; no session cookie required.
  bindRoute("/connections/:provider/callback", "GET", "public.auth.login");
  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>("/connections/:provider/callback", async (req, reply) => {
    const spa = appBaseUrl();
    if (req.query.error) {
      return reply.redirect(`${spa}/integrations?error=${encodeURIComponent(req.query.error)}`);
    }
    const state = req.query.state;
    const code = req.query.code;
    if (!state || !code) {
      return reply.redirect(`${spa}/integrations?error=missing_code`);
    }
    const payload = await verifyOAuthState(state);
    if (!payload || payload.provider !== req.params.provider) {
      return reply.redirect(`${spa}/integrations?error=invalid_state`);
    }
    if (!tokenEncryptionConfigured()) {
      return reply.redirect(`${spa}/integrations?error=token_encryption_not_configured`);
    }
    try {
      const tokens = await exchangeAuthorizationCode({
        provider: payload.provider,
        code,
        verifier: payload.verifier,
      });
      await ensureSeedUsers();
      await upsertConnectionPlane({
        tenantId: payload.tid,
        userId: payload.uid,
        provider: payload.provider,
        status: "connected",
        externalAccountEmail: tokens.externalAccount,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken
          ? encryptToken(tokens.refreshToken)
          : null,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      });
      return reply.redirect(
        `${spa}/integrations?connected=${encodeURIComponent(payload.provider)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "exchange_failed";
      return reply.redirect(`${spa}/integrations?error=${encodeURIComponent(msg)}`);
    }
  });

  bindRoute("/connections/:id/disconnect", "POST", "connection.own");
  app.post<{ Params: { id: string } }>(
    "/connections/:id/disconnect",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const ok = await disconnectConnectionPlane(req.auth.tenantId, req.params.id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return { disconnected: true };
    },
  );

  // Legacy stub path — redirect clients to authorize.
  bindRoute("/connections/:provider/connect", "POST", "connection.own");
  app.post<{ Params: { provider: string } }>(
    "/connections/:provider/connect",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      return reply.code(202).send({
        provider: req.params.provider,
        status: "authorization_pending",
        hint: "Use GET /connections/:provider/authorize for the OAuth URL",
      });
    },
  );
}
