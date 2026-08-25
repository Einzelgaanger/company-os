import { describe, expect, it } from "vitest";
import {
  projectProgress,
  commitmentProgress,
  formatProgressLabel,
  assertNoPerformanceScore,
  assertNoIndividualSentiment,
  can,
  aggregateSurveyThemes,
  resolveFeatureFlags,
  assertEmailIngestionEnabled,
  type AuthUser,
} from "../src/index.js";

describe("progress §8.2", () => {
  it("hand-calcs priority-weighted progress", () => {
    const r = projectProgress([
      { id: "1", status: "done", progressPct: null, priority: "high" },
      { id: "2", status: "open", progressPct: null, priority: "low" },
      { id: "3", status: "in_progress", progressPct: null, priority: "medium" },
    ]);
    // weights 3+1+2=6; (3*100 + 1*0 + 2*50)/6 = 400/6 ≈ 66.67
    expect(r.pct).toBeCloseTo(66.67, 1);
    expect(r.lowConfidence).toBe(true);
    expect(formatProgressLabel(r.pct, true)).toMatch(/^~/);
  });

  it("prefers self-reported progress", () => {
    const r = commitmentProgress({
      status: "open",
      progressPct: 40,
    });
    expect(r).toEqual({ pct: 40, source: "self_reported" });
  });

  it("never invents from elapsed time — cancelled excluded", () => {
    const r = projectProgress([
      { id: "1", status: "cancelled", progressPct: 99, priority: "critical" },
      { id: "2", status: "done", progressPct: null, priority: "medium" },
    ]);
    expect(r.pct).toBe(100);
  });
});

describe("C-1 / C-2 guards", () => {
  it("throws on performance score keys", () => {
    expect(() =>
      assertNoPerformanceScore({ user: "x", performance_score: 9 }),
    ).toThrow(/C-1/);
  });

  it("throws on user-keyed sentiment", () => {
    expect(() =>
      assertNoIndividualSentiment({ userId: "u1", sentiment: "neg" }),
    ).toThrow(/C-2/);
  });

  it("allows aggregate sentiment without user key", () => {
    expect(() =>
      assertNoIndividualSentiment({ n: 12, sentiment_label: "mixed" }),
    ).not.toThrow();
  });
});

describe("authz can()", () => {
  const mgr: AuthUser = {
    id: "m1",
    tenantId: "t1",
    role: "manager",
    managerId: null,
  };
  const member: AuthUser = {
    id: "u1",
    tenantId: "t1",
    role: "member",
    managerId: "m1",
  };

  it("allows manager project.view_team in team", () => {
    expect(can(mgr, "project.view_team", { inCallerTeam: true })).toBe(true);
  });

  it("denies member project.view_team", () => {
    expect(can(member, "project.view_team", { inCallerTeam: true })).toBe(
      false,
    );
  });

  it("fails closed on unknown action", () => {
    expect(can(mgr, "hack.the.planet")).toBe(false);
  });
});

describe("survey aggregate min n", () => {
  it("suppresses n=4", () => {
    const r = aggregateSurveyThemes([
      { themeTags: ["load"] },
      { themeTags: ["load"] },
      { themeTags: ["clarity"] },
      { themeTags: ["clarity"] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("below_min_n");
  });

  it("surfaces themes at n=5", () => {
    const r = aggregateSurveyThemes([
      { themeTags: ["load"] },
      { themeTags: ["load"] },
      { themeTags: ["clarity"] },
      { themeTags: ["clarity"] },
      { themeTags: ["load"] },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.n).toBe(5);
      expect(r.themes[0]?.tag).toBe("load");
    }
  });
});

describe("feature flags Phase 7", () => {
  it("email_ingestion defaults off", () => {
    expect(resolveFeatureFlags({}, {}).email_ingestion).toBe(false);
    expect(() =>
      assertEmailIngestionEnabled(resolveFeatureFlags({}, {})),
    ).toThrow(/C-5/);
  });
});

describe("Kayode escalation routing", () => {
  it("routes SharePoint tag to ownership map owner", async () => {
    const { resolveEscalationOwner, buildEscalationContext } = await import(
      "../src/escalation.js"
    );
    const routed = resolveEscalationOwner(
      ["sharepoint", "infra"],
      [{ tag: "sharepoint", assigneeUserId: "user-it-lead" }],
      "user-fallback",
    );
    expect(routed.assigneeUserId).toBe("user-it-lead");
    const ctx = buildEscalationContext({
      commitmentTitle: "SharePoint migration",
      ownerName: "Kayode",
      dueDate: "2026-08-20",
      lastStatus: "at_risk",
      blockerNote: "Waiting on license",
      projectName: "IT Ops",
    });
    expect(ctx).toMatch(/SharePoint migration/);
    expect(ctx).toMatch(/Waiting on license/);
  });
});
