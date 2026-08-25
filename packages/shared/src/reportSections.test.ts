import { describe, expect, it } from "vitest";
import { COORDINATION_MODES } from "./coordination.js";
import {
  REPORT_FOOTER,
  assertNoPersonalMetrics,
  reportSectionSpecs,
} from "./reportSections.js";

describe("report sections by coordination mode — §10.2, §3.3", () => {
  it("gives every mode a different section list", () => {
    const shapes = COORDINATION_MODES.map((m) =>
      reportSectionSpecs(m, { surveyRespondents: 20 })
        .map((s) => s.key)
        .join(","),
    );
    expect(new Set(shapes).size).toBe(5);
  });

  it("substitutes the vocabulary into section labels", () => {
    const agency = reportSectionSpecs("mutual_adjustment").find((s) => s.key === "needs_decision");
    const firm = reportSectionSpecs("standardized_skills").find((s) => s.key === "needs_decision");
    expect(agency?.labels.pastDate).toBe("Past its date");
    expect(firm?.labels.pastDate).toBe("Past committed date");
    expect(agency?.labels.escalate).toBe("Ask someone else");
    expect(firm?.labels.escalate).toBe("Refer to coordinator");
  });

  it("never lets the word overdue reach a professional practice's report", () => {
    const rendered = reportSectionSpecs("standardized_skills", { surveyRespondents: 20 })
      .flatMap((s) => [s.title, s.caption, ...Object.values(s.labels)])
      .join(" ")
      .toLowerCase();
    expect(rendered).not.toContain("overdue");
  });

  it("omits team pulse below the C-2 floor and outside org scope", () => {
    const keys = (respondents: number, scope: "org" | "team") =>
      reportSectionSpecs("mutual_adjustment", { surveyRespondents: respondents, scope }).map(
        (s) => s.key,
      );
    expect(keys(20, "org")).toContain("team_pulse");
    expect(keys(4, "org")).not.toContain("team_pulse");
    expect(keys(20, "team")).not.toContain("team_pulse");
  });

  it("scopes a project report down to three sections at query time", () => {
    expect(reportSectionSpecs("mutual_adjustment", { scope: "project" }).map((s) => s.key)).toEqual([
      "needs_decision",
      "project_health",
      "what_moved",
    ]);
  });

  it("carries the same footer in every mode", () => {
    expect(REPORT_FOOTER).toContain("not a measure of individual performance");
  });
});

describe("§10.3 what may never appear", () => {
  it("permits naming a queue", () => {
    expect(() =>
      assertNoPersonalMetrics({
        sections: [
          {
            key: "flow",
            holders: [
              { label: "the data team", itemCount: 6, teamDays: 41 },
              { label: "Finance", itemCount: 2, teamDays: 9 },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a per-person response rate however it is spelled", () => {
    for (const key of ["responseRate", "response_rate", "completionRate", "onTimeRate"]) {
      expect(() => assertNoPersonalMetrics({ people: [{ [key]: 0.8 }] })).toThrow(/§10.3/);
    }
  });

  it("rejects any metric sitting next to a user id", () => {
    expect(() =>
      assertNoPersonalMetrics({ rows: [{ user_id: "u1", medianWorkingDays: 4.2 }] }),
    ).toThrow(/keyed to/);
    expect(() => assertNoPersonalMetrics({ rows: [{ userId: "u1", agreementPct: 91 }] })).toThrow(
      /keyed to/,
    );
  });

  it("allows a user id with no metric attached", () => {
    expect(() =>
      assertNoPersonalMetrics({ rows: [{ user_id: "u1", displayName: "the data team" }] }),
    ).not.toThrow();
  });
});
