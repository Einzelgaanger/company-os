import { describe, expect, it } from "vitest";
import { assertNoPerformanceScore } from "./guards.js";
import { assertNoPersonalMetrics } from "./reportSections.js";
import {
  STALE_ACTIVE_WORKING_DAYS,
  corroborate,
  rollupCorroboration,
  type CorroborationInput,
} from "./corroboration.js";

const input = (over: Partial<CorroborationInput>): CorroborationInput => ({
  commitmentId: "c1",
  claimedState: "active",
  workingDaysSinceLastEvent: 1,
  signals: [],
  ...over,
});

describe("§4.10 corroboration", () => {
  it("corroborates a done claim against an artifact", () => {
    const v = corroborate(
      input({
        claimedState: "done",
        signals: [
          { source: "artifact", observed: true, at: "2026-08-20T09:00:00Z", detail: "Deck v4.pdf" },
        ],
      }),
    );
    expect(v.agreement).toBe("corroborated");
    expect(v.level).toBe("single");
    expect(v.needsLook).toBe(false);
  });

  it("records multi-source agreement when two sources agree", () => {
    const v = corroborate(
      input({
        claimedState: "active",
        signals: [
          { source: "artifact", observed: true, at: "2026-08-20T09:00:00Z", detail: "Draft.docx" },
          {
            source: "internal_activity",
            observed: true,
            at: "2026-08-21T09:00:00Z",
            detail: "State changed",
          },
        ],
      }),
    );
    expect(v.level).toBe("multiple");
    expect(v.agreeingSources).toEqual(["artifact", "internal_activity"]);
  });

  it("ignores a signal that cannot speak to the claim", () => {
    const v = corroborate(
      input({
        claimedState: "waiting_external",
        signals: [
          { source: "calendar", observed: true, at: "2026-08-20T09:00:00Z", detail: "Sync held" },
        ],
      }),
    );
    expect(v.agreement).toBe("unobserved");
    expect(v.agreeingSources).toEqual([]);
  });

  it("stays unobserved with no connectors rather than calling the claim wrong", () => {
    const v = corroborate(input({ claimedState: "waiting_dependency", signals: [] }));
    expect(v.agreement).toBe("unobserved");
    expect(v.needsLook).toBe(false);
    expect(v.prompt).toBeNull();
  });

  it("flags a stale active item and asks neutrally", () => {
    const v = corroborate(
      input({ claimedState: "active", workingDaysSinceLastEvent: STALE_ACTIVE_WORKING_DAYS + 2 }),
    );
    expect(v.agreement).toBe("diverged");
    expect(v.needsLook).toBe(true);
    expect(v.prompt).toBe("This has been active for 12 days with no updates. Still moving?");
    // Neutral framing: a question about the item, never a claim about a person.
    expect(v.prompt?.toLowerCase()).not.toMatch(/late|failed|should have|why/);
  });

  it("does not call an active item stale one day early", () => {
    const v = corroborate(
      input({ claimedState: "active", workingDaysSinceLastEvent: STALE_ACTIVE_WORKING_DAYS - 1 }),
    );
    expect(v.agreement).toBe("unobserved");
  });

  it("flags a done claim with nothing where the artifact should be", () => {
    const v = corroborate(
      input({
        claimedState: "done",
        signals: [{ source: "artifact", observed: false, at: "2026-08-20T09:00:00Z", detail: "No match" }],
      }),
    );
    expect(v.agreement).toBe("diverged");
    expect(v.needsLookReason).toContain("nothing matching it has appeared");
  });

  it("does not flag a waiting item just because a source found nothing", () => {
    const v = corroborate(
      input({
        claimedState: "waiting_external",
        signals: [
          { source: "external_reply", observed: false, at: "2026-08-20T09:00:00Z", detail: "No reply" },
        ],
      }),
    );
    // Of course there is no reply — that is what waiting_external means.
    expect(v.agreement).toBe("unobserved");
  });
});

describe("§4.10 divergence is never per person", () => {
  const verdicts = [
    corroborate(input({ commitmentId: "a", claimedState: "active", workingDaysSinceLastEvent: 14 })),
    corroborate(
      input({
        commitmentId: "b",
        claimedState: "done",
        signals: [{ source: "artifact", observed: true, at: "2026-08-20T09:00:00Z", detail: "f" }],
      }),
    ),
    corroborate(input({ commitmentId: "c", claimedState: "waiting_dependency" })),
  ];

  it("rolls up by item and counts each verdict once", () => {
    expect(rollupCorroboration(verdicts)).toEqual({
      itemsChecked: 3,
      corroborated: 1,
      unobserved: 1,
      diverged: 1,
      needsLookItemIds: ["a"],
    });
  });

  it("exposes no person anywhere in a verdict or a rollup", () => {
    const payload = { verdicts, rollup: rollupCorroboration(verdicts) };
    expect(() => assertNoPerformanceScore(payload)).not.toThrow();
    expect(() => assertNoPersonalMetrics(payload)).not.toThrow();
    expect(JSON.stringify(payload)).not.toMatch(/user_?[Ii]d/);
  });
});
