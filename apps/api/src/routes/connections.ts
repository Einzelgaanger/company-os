import { randomBytes, randomUUID } from "node:crypto";
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
  probeApiKey,
  verifyOAuthState,
} from "../lib/oauth.js";
import {
  CONNECTORS,
  connector,
  serializeConnector,
} from "../lib/providerRegistry.js";
import { encryptToken, tokenEncryptionConfigured } from "../lib/tokenCrypto.js";
import { ensureSeedUsers } from "../store/memory.js";
import {
  disconnectConnectionPlane,
  getConnectionPlane,
  listConnectionEventsPlane,
  listConnectionsPlane,
  recordConnectionEventPlane,
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

/** Inbound webhook base for connectors the provider pushes to. */
function webhookBaseUrl(): string {
  return (
    process.env.WEBHOOKS_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.PUBLIC_WEBHOOK_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3002"
  );
}

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

  /**
   * The catalog every client renders from: what exists, what the deployment can
   * actually offer, and why not when it cannot.
   */
  bindRoute("/connections/catalog", "GET", "connection.own");
  app.get(
    "/connections/catalog",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      return {
        items: CONNECTORS.map(serializeConnector),
        tokenEncryption: tokenEncryptionConfigured(),
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

  /** Connector audit trail — connects, disconnects and refresh failures. */
  bindRoute("/connections/events", "GET", "connection.org_manage");
  app.get<{ Querystring: { limit?: string } }>(
    "/connections/events",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
      return { items: await listConnectionEventsPlane(req.auth.tenantId, limit) };
    },
  );

  bindRoute("/connections/:provider/authorize", "GET", "connection.own");
  app.get<{ Params: { provider: string } }>(
    "/connections/:provider/authorize",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const provider = req.params.provider;
      const def = connector(provider);
      if (!def) return reply.code(400).send({ error: "unknown_provider" });
      if (def.auth !== "oauth2") {
        return reply.code(400).send({
          error: "not_an_oauth_provider",
          provider,
          auth: def.auth,
          hint:
            def.auth === "api_key"
              ? `POST /connections/${provider}/credentials`
              : `POST /connections/${provider}/webhook`,
        });
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
        await recordConnectionEventPlane({
          tenantId: req.auth.tenantId,
          provider,
          event: "authorized",
          actorUserId: req.auth.userId,
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
        if (err.message.startsWith("instance_not_configured")) {
          return reply.code(503).send({
            error: "instance_not_configured",
            provider,
            missing: [err.message.split(":")[1] ?? "instance"],
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
    const def = connector(payload.provider);
    try {
      const tokens = await exchangeAuthorizationCode({
        provider: payload.provider,
        code,
        verifier: payload.verifier,
      });
      await ensureSeedUsers();
      const row = await upsertConnectionPlane({
        tenantId: payload.tid,
        userId: def?.orgLevel ? null : payload.uid,
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
      await recordConnectionEventPlane({
        tenantId: payload.tid,
        connectionId: row.id,
        provider: payload.provider,
        event: "connected",
        actorUserId: payload.uid,
        detail: tokens.externalAccount,
      });
      return reply.redirect(
        `${spa}/integrations?connected=${encodeURIComponent(payload.provider)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "exchange_failed";
      await recordConnectionEventPlane({
        tenantId: payload.tid,
        provider: payload.provider,
        event: "sync_failed",
        actorUserId: payload.uid,
        detail: msg.slice(0, 200),
      });
      return reply.redirect(`${spa}/integrations?error=${encodeURIComponent(msg)}`);
    }
  });

  /**
   * api_key connectors. The credential is validated against the provider before
   * it is stored, so a bad paste fails here instead of producing a connector
   * that looks healthy and reads nothing.
   */
  bindRoute("/connections/:provider/credentials", "POST", "connection.org_manage");
  app.post<{
    Params: { provider: string };
    Body: { credential?: string; instance?: string };
  }>(
    "/connections/:provider/credentials",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const provider = req.params.provider;
      const def = connector(provider);
      if (!def) return reply.code(400).send({ error: "unknown_provider" });
      if (def.auth !== "api_key") {
        return reply.code(400).send({ error: "not_an_api_key_provider", provider });
      }
      const credential = req.body?.credential?.trim();
      if (!credential) return reply.code(400).send({ error: "credential_required" });
      if (!tokenEncryptionConfigured()) {
        return reply.code(503).send({
          error: "token_encryption_not_configured",
          missing: ["TOKEN_ENCRYPTION_KEY or KMS_KEY_ID"],
        });
      }

      const probe = await probeApiKey(provider, credential);
      if (!probe.ok) {
        await recordConnectionEventPlane({
          tenantId: req.auth.tenantId,
          provider,
          event: "sync_failed",
          actorUserId: req.auth.userId,
          detail: probe.detail ?? "credential_rejected",
        });
        return reply
          .code(400)
          .send({ error: "credential_rejected", detail: probe.detail });
      }

      await ensureSeedUsers();
      const row = await upsertConnectionPlane({
        tenantId: req.auth.tenantId,
        userId: def.orgLevel ? null : req.auth.userId,
        provider,
        status: "connected",
        externalAccountEmail: probe.account,
        apiKeyEnc: encryptToken(credential),
        instance: req.body?.instance?.trim() || null,
        scopes: [],
      });
      await recordConnectionEventPlane({
        tenantId: req.auth.tenantId,
        connectionId: row.id,
        provider,
        event: "connected",
        actorUserId: req.auth.userId,
        detail: probe.account,
      });
      return reply.code(201).send({ connection: row });
    },
  );

  /**
   * webhook connectors. Mints an opaque per-tenant path id and a signing secret.
   * The secret is shown once and stored encrypted — there is no read-back route.
   */
  bindRoute("/connections/:provider/webhook", "POST", "connection.org_manage");
  app.post<{ Params: { provider: string } }>(
    "/connections/:provider/webhook",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const provider = req.params.provider;
      const def = connector(provider);
      if (!def) return reply.code(400).send({ error: "unknown_provider" });
      if (def.auth !== "webhook") {
        return reply.code(400).send({ error: "not_a_webhook_provider", provider });
      }
      if (!tokenEncryptionConfigured()) {
        return reply.code(503).send({
          error: "token_encryption_not_configured",
          missing: ["TOKEN_ENCRYPTION_KEY or KMS_KEY_ID"],
        });
      }
      const webhookId = randomUUID();
      const secret = randomBytes(32).toString("hex");
      await ensureSeedUsers();
      const row = await upsertConnectionPlane({
        tenantId: req.auth.tenantId,
        userId: null,
        provider,
        status: "connected",
        externalAccountEmail: null,
        webhookId,
        webhookSecretEnc: encryptToken(secret),
        scopes: [],
      });
      await recordConnectionEventPlane({
        tenantId: req.auth.tenantId,
        connectionId: row.id,
        provider,
        event: "connected",
        actorUserId: req.auth.userId,
        detail: `webhook ${webhookId}`,
      });
      return reply.code(201).send({
        connection: row,
        webhookUrl: `${webhookBaseUrl()}/webhooks/${provider}/${webhookId}`,
        // Shown once. Company OS keeps only the encrypted copy.
        signingSecret: secret,
      });
    },
  );

  bindRoute("/connections/:id/disconnect", "POST", "connection.own");
  app.post<{ Params: { id: string } }>(
    "/connections/:id/disconnect",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const existing = await getConnectionPlane(req.auth.tenantId, req.params.id);
      const ok = await disconnectConnectionPlane(req.auth.tenantId, req.params.id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      await recordConnectionEventPlane({
        tenantId: req.auth.tenantId,
        connectionId: req.params.id,
        provider: existing?.provider ?? "unknown",
        event: "disconnected",
        actorUserId: req.auth.userId,
      });
      return { disconnected: true };
    },
  );

  /** Re-run the handshake for an expired or errored OAuth connection. */
  bindRoute("/connections/:id/reconnect", "POST", "connection.own");
  app.post<{ Params: { id: string } }>(
    "/connections/:id/reconnect",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
      const existing = await getConnectionPlane(req.auth.tenantId, req.params.id);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      const def = connector(existing.provider);
      if (!def || def.auth !== "oauth2") {
        return reply.code(400).send({
          error: "not_an_oauth_provider",
          provider: existing.provider,
        });
      }
      const env = oauthEnvStatus(existing.provider);
      if (!env.configured) {
        return reply.code(503).send({
          error: "oauth_not_configured",
          provider: existing.provider,
          missing: env.missing,
        });
      }
      const { authUrl, state } = await buildAuthorizeUrl({
        provider: existing.provider,
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
      });
      return { authUrl, state, provider: existing.provider };
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
