import { describe, expect, it } from "vitest";
import {
  chainCompletePct,
  feverReading,
  sizeBuffer,
  type ChainCommitment,
} from "./buffer.js";

describe("§4.7 buffer sizing", () => {
  it("uses the admin's number when there is one", () => {
    const r = sizeBuffer({
      explicitBufferDays: 12,
      remainingWorkingDays: 40,
      spanWorkingDays: 60,
      observedWaitingWorkingDays30d: 30,
    });
    expect(r).toMatchObject({ bufferDays: 12, method: "explicit" });
  });

  it("prefers this project's own observed waiting over the textbook fraction", () => {
    const r = sizeBuffer({
      remainingWorkingDays: 40,
      spanWorkingDays: 60,
      observedWaitingWorkingDays30d: 11,
      observationWorkingDays: 22,
    });
    expect(r.method).toBe("observed_waiting");
    // 11/22 of the remaining 40 working days, inside the 15%–50% band.
    expect(r.bufferDays).toBe(20);
    expect(r.explanation).toContain("last 30 days");
  });

  it("floors the derived buffer at 15% of the remaining span", () => {
    const r = sizeBuffer({
      remainingWorkingDays: 40,
      spanWorkingDays: 60,
      observedWaitingWorkingDays30d: 0.5,
      observationWorkingDays: 22,
    });
    expect(r.bufferDays).toBe(6);
  });

  it("caps the derived buffer at 50% of the remaining span", () => {
    const r = sizeBuffer({
      remainingWorkingDays: 40,
      spanWorkingDays: 60,
      observedWaitingWorkingDays30d: 40,
      observationWorkingDays: 22,
    });
    expect(r.bufferDays).toBe(20);
  });

  it("falls back to the classical rule with nothing observed", () => {
    const r = sizeBuffer({
      remainingWorkingDays: 40,
      spanWorkingDays: 60,
      observedWaitingWorkingDays30d: 0,
    });
    expect(r).toMatchObject({ bufferDays: 30, method: "classical" });
  });

  it("says unknown rather than guessing without a target end date", () => {
    const r = sizeBuffer({
      remainingWorkingDays: null,
      spanWorkingDays: null,
      observedWaitingWorkingDays30d: 12,
    });
    expect(r).toMatchObject({ bufferDays: null, method: "unknown" });
  });
});

describe("§4.7 chain completion — waiting never advances it", () => {
  const item = (over: Partial<ChainCommitment>): ChainCommitment => ({
    id: "x",
    flowState: "ready",
    costOfDelayBand: "standard",
    ...over,
  });

  it("weights completion by cost-of-delay band", () => {
    // One critical item (weight 8) done, one low item (weight 1) untouched.
    expect(
      chainCompletePct([
        item({ id: "a", flowState: "done", costOfDelayBand: "critical" }),
        item({ id: "b", flowState: "ready", costOfDelayBand: "low" }),
      ]),
    ).toBe(88.89);
  });

  it("holds completion where it was while an item waits", () => {
    const waiting = chainCompletePct([
      item({ id: "a", flowState: "waiting_internal", lastSelfReported: 0.4 }),
    ]);
    expect(waiting).toBe(40);
    // The same item, now moving again, counts as half done rather than 40%.
    expect(chainCompletePct([item({ id: "a", flowState: "active" })])).toBe(50);
  });

  it("treats waiting with nothing self-reported as zero, not as progress", () => {
    expect(chainCompletePct([item({ flowState: "waiting_external" })])).toBe(0);
  });

  it("excludes cancelled items entirely", () => {
    expect(
      chainCompletePct([
        item({ id: "a", flowState: "done" }),
        item({ id: "b", flowState: "cancelled" }),
      ]),
    ).toBe(100);
  });
});

describe("§4.7 fever zones", () => {
  const base = { commitmentCount: 6, hasTargetEndDate: true, bufferDays: 20 };

  it("is green while the buffer is spent slower than the chain completes", () => {
    const r = feverReading({ ...base, bufferConsumedDays: 4, chainCompletePct: 50 });
    expect(r.zone).toBe("green");
    expect(r.bufferConsumedPct).toBe(20);
  });

  it("is amber between 1× and 1.5× chain completion", () => {
    expect(feverReading({ ...base, bufferConsumedDays: 8, chainCompletePct: 30 }).zone).toBe(
      "amber",
    );
  });

  it("is red above 1.5× chain completion", () => {
    expect(feverReading({ ...base, bufferConsumedDays: 14, chainCompletePct: 30 }).zone).toBe(
      "red",
    );
  });

  it("is red above 90% consumed whatever the chain says", () => {
    const r = feverReading({ ...base, bufferConsumedDays: 19, chainCompletePct: 99 });
    expect(r.zone).toBe("red");
    expect(r.caption).toContain("whatever the chain says");
  });

  it("says not enough signal rather than showing a misleading green", () => {
    const thin = feverReading({ ...base, commitmentCount: 2, bufferConsumedDays: 0, chainCompletePct: 0 });
    expect(thin.zone).toBe("unknown");
    expect(thin.caption).toContain("Not enough signal yet");

    expect(
      feverReading({ ...base, hasTargetEndDate: false, bufferConsumedDays: 0, chainCompletePct: 0 })
        .zone,
    ).toBe("unknown");
    expect(
      feverReading({ ...base, bufferDays: null, bufferConsumedDays: 0, chainCompletePct: 0 }).zone,
    ).toBe("unknown");
  });

  it("carries a caption so the chart is readable in greyscale", () => {
    for (const consumed of [0, 5, 10, 19]) {
      const r = feverReading({ ...base, bufferConsumedDays: consumed, chainCompletePct: 40 });
      expect(r.caption.length).toBeGreaterThan(0);
    }
  });
});
