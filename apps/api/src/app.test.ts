process.env.JWT_ACCESS_SECRET ??= "test-jwt-access-secret-32chars!!";
process.env.CORS_ORIGINS ??= "http://localhost:5173";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { __resetMemoryStore } from "./store/memory.js";
import { resetPolicyForTests } from "./lib/policy.js";

async function login(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "alfred@prodg.studio", password: "LoopDemo2026!" },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.accessToken).toBeTruthy();
  return body.accessToken as string;
}

describe("API inject (memory)", () => {
  beforeEach(() => {
    resetPolicyForTests();
    __resetMemoryStore();
  });

  afterEach(async () => {
    // no-op — each test builds its own app
  });

  it("login + review confirm activates item", async () => {
    const app = await buildApp();
    const token = await login(app);

    const list = await app.inject({
      method: "GET",
      url: "/review",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as Array<{ id: string; needsReview: boolean }>;
    expect(items.length).toBeGreaterThan(0);
    const id = items[0].id;

    const confirm = await app.inject({
      method: "POST",
      url: `/review/${id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().activated).toBe(true);
    expect(confirm.json().item.needsReview).toBe(false);

    await app.close();
  });

  it("surveys suppress below min n", async () => {
    const app = await buildApp();
    const token = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/surveys/cycle-below/aggregate",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().suppressed).toBe(true);
    expect(res.json().n).toBe(4);

    const ok = await app.inject({
      method: "GET",
      url: "/surveys/cycle-ok/aggregate",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.json().suppressed).toBe(false);
    await app.close();
  });

  it("connections health returns alerts", async () => {
    const app = await buildApp();
    const token = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/connections/health",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().alerts)).toBe(true);
    expect(res.json().alerts.length).toBeGreaterThan(0);
    await app.close();
  });

  it("SCIM active:false is idempotent", async () => {
    const app = await buildApp();
    const token = await login(app);
    const uid = "00000000-0000-0000-0000-000000000099";
    const first = await app.inject({
      method: "PATCH",
      url: `/scim/v2/Users/${uid}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().idempotent).toBe(false);

    const second = await app.inject({
      method: "PATCH",
      url: `/scim/v2/Users/${uid}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().idempotent).toBe(true);
    await app.close();
  });

  it("notice ack + compliance attest", async () => {
    const app = await buildApp();
    const token = await login(app);

    const notice = await app.inject({
      method: "POST",
      url: "/onboarding/notice/ack",
      headers: { authorization: `Bearer ${token}` },
      payload: { version: "2026-08-v1" },
    });
    expect(notice.statusCode).toBe(201);

    const attest = await app.inject({
      method: "POST",
      url: "/onboarding/compliance/attest",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lawfulBasis: "legitimate_interest",
        dpiaCompleted: true,
        liaCompleted: true,
        worksCouncilRequired: false,
        worksCouncilConsulted: false,
        employeeNoticePublished: true,
        employeeNoticeVersion: "2026-08-v1",
        dpoEmail: "privacy@prodg.studio",
        acknowledgedNotForHrDecisions: true,
      },
    });
    expect(attest.statusCode).toBe(201);
    expect(attest.json().high_risk_use_prohibited).toBe(true);
    await app.close();
  });

  it("project progress computes from memory commitments", async () => {
    const app = await buildApp();
    const token = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/projects/any/progress",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().progressPct).toBe("number");
    expect(res.json().label).toBeTruthy();
    await app.close();
  });

  it("DSR create + list + messaging metrics + survey current", async () => {
    const app = await buildApp();
    const token = await login(app);

    const dsr = await app.inject({
      method: "POST",
      url: "/dsr",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "access", detail: "export please" },
    });
    expect(dsr.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/dsr",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);

    const metrics = await app.inject({
      method: "GET",
      url: "/messaging/metrics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().metaTier).toBeTruthy();

    const current = await app.inject({
      method: "GET",
      url: "/surveys/current",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().status).toBe("live");

    const milestones = await app.inject({
      method: "GET",
      url: "/projects/any/milestones",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(milestones.statusCode).toBe(200);
    expect(Array.isArray(milestones.json().items)).toBe(true);

    await app.close();
  });
});
