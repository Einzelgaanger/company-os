process.env.JWT_ACCESS_SECRET ??= "test-jwt-access-secret-32chars!!";
process.env.CORS_ORIGINS ??= "http://localhost:5173";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { __resetMemoryStore } from "./store/memory.js";
import {
  CONNECTORS,
  connectorAvailability,
  connector,
  serializeConnector,
} from "./lib/providerRegistry.js";

async function login(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "alfred@prodg.studio", password: "LoopDemo2026!" },
  });
  return res.json().accessToken as string;
}

describe("connector registry", () => {
  it("has unique ids and a definition for every auth kind", () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(50);
    for (const def of CONNECTORS) {
      if (def.auth === "oauth2") {
        expect(def.oauth, `${def.id} oauth block`).toBeTruthy();
        expect(def.clientIdEnv, `${def.id} client id env`).toBeTruthy();
        expect(def.clientSecretEnv, `${def.id} client secret env`).toBeTruthy();
      }
      if (def.auth === "api_key") expect(def.apiKey, `${def.id} apiKey block`).toBeTruthy();
      if (def.auth === "webhook") {
        expect(def.oauth, `${def.id} must not carry oauth config`).toBeUndefined();
      }
      expect(def.docs.startsWith("https://"), `${def.id} docs link`).toBe(true);
    }
  });

  it("requests read-only scopes everywhere", () => {
    const forbidden = /(?:^|[.:_])(write|send|delete|manage|modify|compose)(?:$|[.:_])/i;
    for (const def of CONNECTORS) {
      for (const scope of def.oauth?.scopes ?? []) {
        expect(forbidden.test(scope), `${def.id}: ${scope}`).toBe(false);
      }
    }
  });

  it("reports missing client credentials instead of half-configuring", () => {
    const slack = connector("slack")!;
    delete process.env.SLACK_OAUTH_CLIENT_ID;
    delete process.env.SLACK_OAUTH_CLIENT_SECRET;
    const availability = connectorAvailability(slack);
    expect(availability.configured).toBe(false);
    expect(availability.missing).toContain("SLACK_OAUTH_CLIENT_ID");
  });

  it("offers email connectors without a review flag", () => {
    delete process.env.FEATURE_EMAIL_INGESTION;
    expect(connectorAvailability(connector("gmail")!).missing).not.toContain(
      "FEATURE_EMAIL_INGESTION=true",
    );
    expect(connectorAvailability(connector("outlook")!).missing).not.toContain(
      "FEATURE_EMAIL_INGESTION=true",
    );
  });

  it("never serializes a secret", () => {
    process.env.SLACK_OAUTH_CLIENT_SECRET = "shhh-not-for-clients";
    for (const def of CONNECTORS) {
      const serialized = serializeConnector(def) as Record<string, unknown>;
      for (const key of Object.keys(serialized)) {
        expect(/secret|accesstoken|refreshtoken|apikey/i.test(key), `${def.id}.${key}`).toBe(
          false,
        );
      }
      expect(JSON.stringify(serialized)).not.toContain("shhh-not-for-clients");
    }
    delete process.env.SLACK_OAUTH_CLIENT_SECRET;
  });
});

describe("connector routes", () => {
  beforeEach(() => {
    process.env.LOOP_MEMORY_STORE = "1";
    __resetMemoryStore();
  });
  afterEach(() => {
    __resetMemoryStore();
  });

  it("serves the catalog with availability per connector", async () => {
    const app = await buildApp();
    const token = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/connections/catalog",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; configured: boolean; missing: string[] }>;
    };
    expect(body.items.length).toBe(CONNECTORS.length);
    const gmail = body.items.find((i) => i.id === "gmail")!;
    expect(gmail.configured).toBe(false);
    expect(gmail.missing.length).toBeGreaterThan(0);
    await app.close();
  });

  it("points non-OAuth connectors at the right endpoint instead of failing vaguely", async () => {
    const app = await buildApp();
    const token = await login(app);

    const apiKeyProvider = await app.inject({
      method: "GET",
      url: "/connections/trello/authorize",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(apiKeyProvider.statusCode).toBe(400);
    expect(apiKeyProvider.json().error).toBe("not_an_oauth_provider");
    expect(apiKeyProvider.json().hint).toContain("/credentials");

    const unknown = await app.inject({
      method: "GET",
      url: "/connections/myspace/authorize",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error).toBe("unknown_provider");
    await app.close();
  });

  it("refuses an OAuth handshake when client credentials are absent", async () => {
    const app = await buildApp();
    const token = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/connections/slack/authorize",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("oauth_not_configured");
    await app.close();
  });

  it("mints a webhook endpoint and never reads the secret back", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const app = await buildApp();
    const token = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/connections/fathom/webhook",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(created.statusCode).toBe(201);
    const { webhookUrl, signingSecret } = created.json();
    expect(webhookUrl).toContain("/webhooks/fathom/");
    expect(signingSecret).toHaveLength(64);

    const list = await app.inject({
      method: "GET",
      url: "/connections",
      headers: { authorization: `Bearer ${token}` },
    });
    const raw = list.payload;
    expect(raw).not.toContain(signingSecret);
    expect(raw).not.toMatch(/"(access|refresh)Token|apiKeyEnc|webhookSecret/);

    const events = await app.inject({
      method: "GET",
      url: "/connections/events",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(events.statusCode).toBe(200);
    expect(events.json().items[0].provider).toBe("fathom");
    delete process.env.TOKEN_ENCRYPTION_KEY;
    await app.close();
  });

  it("rejects a credential the provider does not accept", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const app = await buildApp();
    const token = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/connections/telegram/credentials",
      headers: { authorization: `Bearer ${token}` },
      payload: { credential: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("credential_required");
    delete process.env.TOKEN_ENCRYPTION_KEY;
    await app.close();
  });
});
