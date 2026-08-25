/**
 * A3 — legal records are enforced server-side.
 *
 * These tests are the proof for the two gates that browser storage used to fake:
 * a `provisioning` tenant cannot invite, connect, or send; and an account with a
 * null notice acknowledgement cannot send. Remove the provisioning plugin from
 * app.ts and every 409 assertion below fails.
 */
process.env.JWT_ACCESS_SECRET ??= "test-jwt-access-secret-32chars!!";
process.env.CORS_ORIGINS ??= "http://localhost:5173";

import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import {
  __resetMemoryStore,
  ensureSeedUsers,
  findUserByEmail,
  setTenantStatus,
} from "./store/memory.js";
import { resetPolicyForTests } from "./lib/policy.js";
import { readNoticeAck } from "./store/legal.js";

const DEMO_EMAIL = "alfred@prodg.studio";
const DEMO_PASSWORD = "LoopDemo2026!";

async function login(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  return res.json().accessToken as string;
}

async function tenantId(): Promise<string> {
  await ensureSeedUsers();
  return findUserByEmail(DEMO_EMAIL)!.tenantId;
}

async function ackNoticeVia(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/onboarding/notice/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { version: "2026-08-v1" },
  });
  expect(res.statusCode).toBe(201);
}

describe("A3 legal records", () => {
  beforeEach(() => {
    resetPolicyForTests();
    __resetMemoryStore();
  });

  describe("provisioning tenants are blocked with 409", () => {
    it("blocks invites", async () => {
      const app = await buildApp();
      const token = await login(app);
      setTenantStatus(await tenantId(), "provisioning");

      const res = await app.inject({
        method: "POST",
        url: "/invites",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "new.hire@prodg.studio", role: "member" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("tenant_provisioning");
      await app.close();
    });

    it("blocks connection connect", async () => {
      const app = await buildApp();
      const token = await login(app);
      setTenantStatus(await tenantId(), "provisioning");

      const res = await app.inject({
        method: "POST",
        url: "/connections/google_calendar/connect",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("tenant_provisioning");
      await app.close();
    });

    it("blocks messaging send", async () => {
      const app = await buildApp();
      const token = await login(app);
      await ackNoticeVia(app, token);
      setTenantStatus(await tenantId(), "provisioning");

      const res = await app.inject({
        method: "POST",
        url: "/messaging/send",
        headers: { authorization: `Bearer ${token}` },
        payload: { templateKey: "checkin_pre_due", preview: "How's it going?" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("tenant_provisioning");
      await app.close();
    });
  });

  describe("active tenants pass the same routes", () => {
    it("allows invite, connect, and send once the notice is acknowledged", async () => {
      const app = await buildApp();
      const token = await login(app);
      setTenantStatus(await tenantId(), "active");
      await ackNoticeVia(app, token);

      const invite = await app.inject({
        method: "POST",
        url: "/invites",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "new.hire@prodg.studio", role: "member" },
      });
      expect(invite.statusCode).toBe(201);

      const connect = await app.inject({
        method: "POST",
        url: "/connections/google_calendar/connect",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(connect.statusCode).toBe(202);

      const send = await app.inject({
        method: "POST",
        url: "/messaging/send",
        headers: { authorization: `Bearer ${token}` },
        payload: { templateKey: "checkin_pre_due", preview: "How's it going?" },
      });
      expect(send.statusCode).toBe(202);
      expect(send.json().approval.status).toBe("pending");
      await app.close();
    });
  });

  describe("notice acknowledgement", () => {
    it("blocks sends while notice_acknowledged_at is null", async () => {
      const app = await buildApp();
      const token = await login(app);
      setTenantStatus(await tenantId(), "active");

      expect(await readNoticeAck(await tenantId(), findUserByEmail(DEMO_EMAIL)!.id)).toBeNull();

      const res = await app.inject({
        method: "POST",
        url: "/messaging/send",
        headers: { authorization: `Bearer ${token}` },
        payload: { templateKey: "checkin_pre_due", preview: "How's it going?" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("notice_not_acknowledged");
      await app.close();
    });

    it("is readable back from the store after acknowledgement", async () => {
      const app = await buildApp();
      const token = await login(app);
      await ackNoticeVia(app, token);

      const tid = await tenantId();
      const stored = await readNoticeAck(tid, findUserByEmail(DEMO_EMAIL)!.id);
      expect(stored?.version).toBe("2026-08-v1");
      expect(stored?.at).toBeTruthy();

      const res = await app.inject({
        method: "GET",
        url: "/onboarding/notice",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  describe("attestation is server-side", () => {
    it("is absent until attested and readable afterwards", async () => {
      const app = await buildApp();
      const token = await login(app);

      const before = await app.inject({
        method: "GET",
        url: "/onboarding/compliance",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(before.statusCode).toBe(404);

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

      const after = await app.inject({
        method: "GET",
        url: "/onboarding/compliance",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(after.statusCode).toBe(200);
      expect(after.json().attestedAt).toBeTruthy();
      await app.close();
    });

    it("rejects an attestation that skips a required works council consultation", async () => {
      const app = await buildApp();
      const token = await login(app);
      const res = await app.inject({
        method: "POST",
        url: "/onboarding/compliance/attest",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          lawfulBasis: "legitimate_interest",
          dpiaCompleted: true,
          liaCompleted: true,
          worksCouncilRequired: true,
          worksCouncilConsulted: false,
          employeeNoticePublished: true,
          employeeNoticeVersion: "2026-08-v1",
          dpoEmail: "privacy@prodg.studio",
          acknowledgedNotForHrDecisions: true,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("works_council_required");
      await app.close();
    });
  });

  it("the SPA keeps no legal records — no compliance/notice localStorage keys remain", async () => {
    const { existsSync, readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const spaRoot = join(process.cwd(), "..", "..", "src");
    if (!existsSync(spaRoot)) return;
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const text = readFileSync(full, "utf8");
        if (/localStorage[^\n]*loop\.(compliance|notice|messaging\.approval)/.test(text)) {
          offenders.push(full);
        }
      }
    };
    walk(spaRoot);
    expect(offenders).toEqual([]);
  });
});
