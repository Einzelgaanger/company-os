import { describe, expect, it } from "vitest";
import {
  COST_OF_DELAY_WEIGHT,
  codWeight,
  compareByCostOfDelay,
  costOfDelayScore,
  promoteBand,
  resolveCostOfDelayBand,
} from "./costOfDelay.js";

describe("cost-of-delay bands §4.5", () => {
  it("uses the published weights", () => {
    expect(COST_OF_DELAY_WEIGHT).toEqual({ critical: 8, high: 4, standard: 2, low: 1 });
  });

  it("falls back to standard for unknown or missing bands", () => {
    expect(codWeight(null)).toBe(2);
    expect(codWeight("urgent-ish")).toBe(2);
  });

  it("defaults to standard when nothing is set", () => {
    const r = resolveCostOfDelayBand();
    expect(r.band).toBe("standard");
    expect(r.source).toBe("default");
    expect(r.promoted).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("inherits the project band", () => {
    const r = resolveCostOfDelayBand({ projectBand: "high", commitmentBandSource: "default" });
    expect(r.band).toBe("high");
    expect(r.source).toBe("project");
  });

  it("lets a manual override beat the project band", () => {
    const r = resolveCostOfDelayBand({
      projectBand: "low",
      commitmentBand: "critical",
      commitmentBandSource: "manual",
    });
    expect(r.band).toBe("critical");
    expect(r.source).toBe("manual");
  });
});

describe("dependency promotion — the one derived signal", () => {
  it("promotes one band and explains why", () => {
    const r = resolveCostOfDelayBand({ projectBand: "standard", blockedItemCount: 3 });
    expect(r.baseBand).toBe("standard");
    expect(r.band).toBe("high");
    expect(r.weight).toBe(4);
    expect(r.promoted).toBe(true);
    expect(r.reason).toBe("raised to High — 3 items are waiting on this");
  });

  it("says 'item is' for a single blocked item", () => {
    const r = resolveCostOfDelayBand({ blockedItemCount: 1 });
    expect(r.reason).toBe("raised to High — 1 item is waiting on this");
  });

  it("does not promote past critical", () => {
    const r = resolveCostOfDelayBand({
      commitmentBand: "critical",
      commitmentBandSource: "manual",
      blockedItemCount: 9,
    });
    expect(r.band).toBe("critical");
    expect(r.promoted).toBe(false);
  });

  it("does not promote when nothing is blocked", () => {
    expect(resolveCostOfDelayBand({ projectBand: "low", blockedItemCount: 0 }).band).toBe("low");
  });

  it("caps at critical from high", () => {
    expect(promoteBand("high")).toBe("critical");
    expect(promoteBand("critical")).toBe("critical");
  });
});

describe("waiting register ordering §4.3", () => {
  it("weights waiting time by band", () => {
    // A critical item waiting one day outranks a low item waiting a week.
    expect(costOfDelayScore("critical", 36_000)).toBeGreaterThan(costOfDelayScore("low", 180_000));
  });

  it("never scores negative time", () => {
    expect(costOfDelayScore("high", -500)).toBe(0);
  });

  it("sorts most costly first", () => {
    const rows = [
      { id: "low-old", costOfDelayBand: "low" as const, workingSeconds: 100_000 },
      { id: "critical-new", costOfDelayBand: "critical" as const, workingSeconds: 36_000 },
      { id: "standard-mid", costOfDelayBand: "standard" as const, workingSeconds: 90_000 },
    ];
    expect([...rows].sort(compareByCostOfDelay).map((r) => r.id)).toEqual([
      "critical-new",
      "standard-mid",
      "low-old",
    ]);
  });
});
