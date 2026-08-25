/**
 * A0 — authz middleware proof.
 * Removing requireBoundAction from app.ts must make the member-create test fail
 * (member would get 201 instead of 403).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "./app.js";
import {
  __resetMemoryStore,
  ensureSeedUsers,
  findUserByEmail,
} from "./store/memory.js";
import { resetPolicyForTests, listBindings, isPublicAction } from "./lib/policy.js";
import { createSession } from "./plugins/auth.js";

process.env.JWT_ACCESS_SECRET ??= "test-jwt-access-secret-32chars!!";
process.env.CORS_ORIGINS ??= "http://localhost:5173";

async function loginAs(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return res.json().accessToken as string;
}

describe("authz middleware (A0)", () => {
  beforeEach(() => {
    resetPolicyForTests();
    __resetMemoryStore();
  });

  it("app.ts registers requireBoundAction preHandler (structural gate)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "app.ts"), "utf8");
    expect(src).toMatch(/preHandler.*requireBoundAction|addHook\(\s*"preHandler"\s*,\s*requireBoundAction/);
  });

  it("member cannot create commitments (403 from middleware)", async () => {
    const app = await buildApp();
    await ensureSeedUsers();
    const owner = findUserByEmail("alfred@prodg.studio")!;
    const session = await createSession({
      userId: "00000000-0000-4000-8000-0000000000aa",
      tenantId: owner.tenantId,
      role: "member",
    });

    const res = await app.inject({
      method: "POST",
      url: "/commitments",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { title: "Should be forbidden for member" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().action).toBe("commitment.create");
    await app.close();
  });

  it("owner can create commitments", async () => {
    const app = await buildApp();
    const token = await loginAs(app, "alfred@prodg.studio", "LoopDemo2026!");
    const res = await app.inject({
      method: "POST",
      url: "/commitments",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "Owner may create this item" },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("unauthenticated protected route is 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/commitments" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("public health does not require auth", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("bindings include non-public actions", async () => {
    const app = await buildApp();
    const bindings = listBindings();
    expect(bindings.size).toBeGreaterThan(5);
    let nonPublic = 0;
    for (const action of bindings.values()) {
      if (!isPublicAction(action) && !action.startsWith("guard.")) nonPublic++;
    }
    expect(nonPublic).toBeGreaterThan(0);
    await app.close();
  });
});
