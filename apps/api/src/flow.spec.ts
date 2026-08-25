/**
 * B2 — the flow reads. 08_PAGES §8.4, §8.5 and the authorization matrix in §8.2.
 *
 * The scope assertions are the important ones: a member must not be able to
 * widen `/flow` to the organization by editing a query string.
 */
process.env.JWT_ACCESS_SECRET ??= "test-jwt-access-secret-32chars!!";
process.env.CORS_ORIGINS ??= "http://localhost:5173";

import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { __resetMemoryStore, ensureSeedUsers, findUserByEmail } from "./store/memory.js";
import { resetPolicyForTests } from "./lib/policy.js";
import { createSession } from "./plugins/auth.js";

type App = Awaited<ReturnType<typeof buildApp>>;

async function loginAsOwner(app: App): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "alfred@prodg.studio", password: "LoopDemo2026!" },
  });
  expect(res.statusCode).toBe(200);
  return res.json().accessToken as string;
}

async function memberToken(): Promise<string> {
  await ensureSeedUsers();
  const sam = findUserByEmail("sam@prodg.studio")!;
  const session = await createSession({
    userId: sam.id,
    tenantId: sam.tenantId,
    role: "member",
  });
  return session.accessToken;
}

function get(app: App, url: string, token: string) {
  return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
}

describe("flow reads (B2)", () => {
  beforeEach(() => {
    resetPolicyForTests();
    __resetMemoryStore();
  });

  it("GET /flow/summary returns the four §4.9 metrics in working days", async () => {
    const app = await buildApp();
    const token = await loginAsOwner(app);

    const res = await get(app, "/flow/summary?scope=org", token);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.scope).toBe("org");
    expect(body.waitingNow.itemCount).toBeGreaterThan(0);
    expect(body.waitingNow.teamDays).toBeGreaterThan(0);
    expect(body.longestWait.holderLabel).toBeTruthy();
    expect(["up", "down", "flat"]).toContain(body.flowDebt.direction);
    expect(typeof body.unblockedThisWeek).toBe("number");
    expect(body.trend).toHaveLength(12);
    await app.close();
  });

  it("GET /flow/aging plots open items and reports its percentile sample size", async () => {
    const app = await buildApp();
    const token = await loginAsOwner(app);

    const res = await get(app, "/flow/aging?scope=org", token);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i: { queueAgeDays: number }) => i.queueAgeDays >= 0)).toBe(true);
    expect(body.sampleSize).toBeGreaterThanOrEqual(5);
    expect(body.percentiles.p95).toBeGreaterThanOrEqual(body.percentiles.p50);
    // A proposed item has no queue clock yet (§4.2) and must not be plotted.
    expect(body.items.some((i: { flowState: string }) => i.flowState === "proposed")).toBe(false);
    await app.close();
  });

  it("GET /waiting orders by cost of delay × age and groups by holder", async () => {
    const app = await buildApp();
    const token = await loginAsOwner(app);

    const res = await get(app, "/waiting?scope=org", token);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.items.length).toBeGreaterThan(1);
    const scores = body.items.map((i: { costScore: number }) => i.costScore);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
    expect(body.byHolder.length).toBeGreaterThan(0);
    expect(body.totals.teamDays).toBeGreaterThan(0);
    await app.close();
  });

  it("GET /waiting honours limit and type filters without distorting the totals", async () => {
    const app = await buildApp();
    const token = await loginAsOwner(app);

    const all = await get(app, "/waiting?scope=org", token);
    const capped = await get(app, "/waiting?scope=org&limit=1", token);
    expect(capped.json().items).toHaveLength(1);
    expect(capped.json().totals.teamDays).toBe(all.json().totals.teamDays);

    const external = await get(app, "/waiting?scope=org&types=external", token);
    expect(external.json().items.length).toBeGreaterThan(0);
    expect(
      external.json().items.every((i: { waitingKind: string }) => i.waitingKind === "external"),
    ).toBe(true);
    await app.close();
  });

  it("refuses a scope above the caller's role instead of widening it", async () => {
    const app = await buildApp();
    const token = await memberToken();

    const own = await get(app, "/waiting?scope=self", token);
    expect(own.statusCode).toBe(200);

    for (const scope of ["team", "org"]) {
      const res = await get(app, `/flow/summary?scope=${scope}`, token);
      expect(res.statusCode).toBe(403);
    }
    await app.close();
  });

  it("advertises only the scopes the role may use, for the switcher", async () => {
    const app = await buildApp();

    const asMember = await get(app, "/flow/summary", await memberToken());
    expect(asMember.json().allowedScopes).toEqual(["self"]);

    const asOwner = await get(app, "/flow/summary", await loginAsOwner(app));
    expect(asOwner.json().allowedScopes).toEqual(["self", "team", "org"]);
    await app.close();
  });

  it("scopes self to the caller's own queue and what waits on them", async () => {
    const app = await buildApp();
    const token = await memberToken();
    await ensureSeedUsers();
    const sam = findUserByEmail("sam@prodg.studio")!;

    const res = await get(app, "/flow/aging?scope=self", token);
    expect(res.statusCode).toBe(200);
    const org = await get(app, "/flow/aging?scope=org", await loginAsOwner(app));
    expect(res.json().items.length).toBeLessThan(org.json().items.length);
    expect(sam.id).toBeTruthy();
    await app.close();
  });

  it("rejects an unknown scope rather than falling back to a wider one", async () => {
    const app = await buildApp();
    const token = await loginAsOwner(app);
    const res = await get(app, "/flow/summary?scope=everything", token);
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("requires a session", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/flow/summary" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
