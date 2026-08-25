import { describe, expect, it } from "vitest";
import {
  assertNoPerformanceScore,
  assertNoIndividualSentiment,
  assertNoPersonalMetrics,
  reportSectionSpecs,
  REPORT_FOOTER,
} from "@loop/shared";

/**
 * B7 gate — reports must never carry per-person performance scores.
 */
describe("no personal metrics in reports (B7)", () => {
  it("report section specs contain no forbidden score language", () => {
    const sections = reportSectionSpecs("mutual_adjustment", {
      surveyRespondents: 20,
      scope: "org",
    });
    const blob = JSON.stringify(sections);
    expect(blob.toLowerCase()).not.toMatch(/performance[_ ]?score/);
    expect(blob.toLowerCase()).not.toMatch(/productivity[_ ]?rank/);
    expect(() => assertNoPersonalMetrics(sections)).not.toThrow();
  });

  it("footer prohibits performance use", () => {
    expect(REPORT_FOOTER.toLowerCase()).toContain("not a measure of individual");
  });

  it("assert helpers reject performance and individual sentiment payloads", () => {
    expect(() =>
      assertNoPerformanceScore({ userId: "u1", performanceScore: 0.9 }),
    ).toThrow(/C-1/);
    expect(() =>
      assertNoIndividualSentiment({ userId: "u1", sentiment: "low" }),
    ).toThrow();
  });
});
