import { describe, expect, it } from "vitest";
import {
  can,
  resolveEscalationOwner,
  buildEscalationContext,
  aggregateSurveyThemes,
  assertNoPerformanceScore,
  type AuthUser,
} from "./index.js";

describe("authz extras", () => {
  it("allows admin any team action without resource", () => {
    const admin: AuthUser = {
      id: "a",
      tenantId: "t",
      role: "admin",
      managerId: null,
    };
    expect(can(admin, "report.view_team")).toBe(true);
    expect(can(admin, "commitment.create")).toBe(true);
  });
});

describe("escalation", () => {
  it("falls back when no tag match", () => {
    const r = resolveEscalationOwner(
      ["unknown"],
      [{ tag: "sharepoint", assigneeUserId: "it" }],
      "fallback",
    );
    expect(r.assigneeUserId).toBe("fallback");
  });

  it("context includes blocker", () => {
    const text = buildEscalationContext({
      commitmentTitle: "X",
      ownerName: "Kayode",
      dueDate: null,
      lastStatus: "at_risk",
      blockerNote: "license",
      projectName: null,
    });
    expect(text).toMatch(/license/);
  });
});

describe("survey + C-1", () => {
  it("aggregates themes", () => {
    const r = aggregateSurveyThemes([
      { themeTags: ["a"] },
      { themeTags: ["a"] },
      { themeTags: ["b"] },
      { themeTags: ["b"] },
      { themeTags: ["a"] },
    ]);
    expect(r.ok).toBe(true);
  });

  it("blocks ranking payloads", () => {
    expect(() => assertNoPerformanceScore({ ranking: [] })).toThrow(/C-1/);
  });
});
