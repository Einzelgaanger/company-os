import { describe, expect, it } from "vitest";
import {
  eligibilityGate,
  isWithinWorkingWindow,
  parseOptInCommand,
  applyStopOptOut,
  bundleByDueDate,
  type EligibilityContext,
} from "./index.js";

const baseTenant = {
  timezone: "Africa/Nairobi",
  workDays: [1, 2, 3, 4, 5],
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
  maxCheckinsPerPersonPerDay: 3,
};

function okCtx(over: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    user: {
      status: "active",
      noticeAcknowledgedAt: "2026-01-01",
      whatsappOptInAt: "2026-01-01",
      whatsappOptOutAt: null,
      phoneVerifiedAt: "2026-01-01",
    },
    tenant: baseTenant,
    commitment: { reviewRequired: false },
    checkinsSentToPersonToday: 0,
    messagedAboutCommitmentWithin24h: false,
    now: new Date("2026-08-24T07:00:00Z"), // Mon 10:00 Africa/Nairobi
    ...over,
  };
}

describe("eligibilityGate §6.3", () => {
  it("passes when all eight checks ok", () => {
    expect(eligibilityGate(okCtx())).toEqual({ ok: true });
  });

  it("fails without notice ack", () => {
    const r = eligibilityGate(
      okCtx({
        user: {
          ...okCtx().user,
          noticeAcknowledgedAt: null,
        },
      }),
    );
    expect(r).toEqual({ ok: false, reason: "notice_not_acknowledged" });
  });

  it("fails after STOP opt-out", () => {
    const stop = applyStopOptOut(new Date("2026-08-24T12:00:00Z"));
    const r = eligibilityGate(
      okCtx({
        user: {
          ...okCtx().user,
          whatsappOptOutAt: stop.whatsappOptOutAt,
        },
      }),
    );
    expect(r).toEqual({ ok: false, reason: "whatsapp_opted_out" });
  });

  it("fails in quiet hours", () => {
    expect(
      isWithinWorkingWindow(
        baseTenant,
        new Date("2026-08-24T17:00:00Z"), // Mon 20:00 Nairobi
      ),
    ).toBe(false);
  });

  it("fails on weekend", () => {
    expect(
      isWithinWorkingWindow(
        baseTenant,
        new Date("2026-08-23T07:00:00Z"), // Sun 10:00 Nairobi
      ),
    ).toBe(false);
  });
});

describe("STOP / START", () => {
  it("parses STOP keywords", () => {
    expect(parseOptInCommand("STOP")).toEqual({ kind: "stop" });
    expect(parseOptInCommand("unsubscribe please")).toEqual({ kind: "stop" });
  });

  it("parses START", () => {
    expect(parseOptInCommand("START")).toEqual({ kind: "start" });
  });
});

describe("bundling", () => {
  it("groups 2+ same due date", () => {
    const groups = bundleByDueDate([
      { commitmentId: "a", title: "A", dueDate: "2026-08-25" },
      { commitmentId: "b", title: "B", dueDate: "2026-08-25" },
      { commitmentId: "c", title: "C", dueDate: "2026-08-26" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });
});
