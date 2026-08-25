import { describe, expect, it } from "vitest";
import {
  agingWip,
  flowSummary,
  isWaitingState,
  waitingRegister,
  waitingTeamDaysAt,
  type FlowCommitment,
  type FlowEvent,
  type TenantTimeSettings,
} from "./index.js";

const settings: TenantTimeSettings = {
  timezone: "Africa/Nairobi",
  workDays: [1, 2, 3, 4, 5],
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
  holidays: [],
};

/** A Wednesday, mid-morning, so no test straddles a weekend by accident. */
const NOW = new Date("2026-08-19T09:00:00+03:00");
const DAY = 86_400_000;

function at(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY).toISOString();
}

function commitment(overrides: Partial<FlowCommitment> & { id: string }): FlowCommitment {
  return {
    title: `Item ${overrides.id}`,
    projectId: null,
    projectName: null,
    ownerUserId: null,
    flowState: "active",
    flowStateSince: at(1),
    firstReadyAt: at(2),
    createdAt: at(2),
    resolvedAt: null,
    waitingOnUserId: null,
    waitingOnExternalName: null,
    waitingOnLabel: null,
    costOfDelayBand: "standard",
    costOfDelayBandSource: "default",
    blockedItemCount: 0,
    committedDate: null,
    needsLook: false,
    ...overrides,
  };
}

describe("flow states", () => {
  it("counts review as waiting, because the owner is done and nobody has accepted", () => {
    expect(isWaitingState("review")).toBe(true);
    expect(isWaitingState("waiting_external")).toBe(true);
    expect(isWaitingState("active")).toBe(false);
    expect(isWaitingState("ready")).toBe(false);
  });
});

describe("waiting register", () => {
  const commitments: FlowCommitment[] = [
    commitment({
      id: "cheap-and-old",
      flowState: "waiting_internal",
      flowStateSince: at(8),
      costOfDelayBand: "low",
      waitingOnLabel: "the data team",
    }),
    commitment({
      id: "critical-and-new",
      flowState: "waiting_external",
      flowStateSince: at(3),
      costOfDelayBand: "critical",
      waitingOnExternalName: "Northgate IT",
    }),
    commitment({ id: "moving", flowState: "active" }),
  ];

  it("orders by cost of delay × age, not by age alone", () => {
    const register = waitingRegister({ commitments, events: [], settings, now: NOW });
    expect(register.items.map((r) => r.id)).toEqual(["critical-and-new", "cheap-and-old"]);
  });

  it("excludes items that are moving", () => {
    const register = waitingRegister({ commitments, events: [], settings, now: NOW });
    expect(register.items.some((r) => r.id === "moving")).toBe(false);
    expect(register.totals.itemCount).toBe(2);
  });

  it("groups by holder, sorted descending by waiting days", () => {
    const register = waitingRegister({ commitments, events: [], settings, now: NOW });
    expect(register.byHolder.map((g) => g.label)).toEqual(["the data team", "Northgate IT"]);
  });

  it("reports working days, so a weekend is not billed as waiting", () => {
    const overWeekend = waitingRegister({
      commitments: [
        commitment({
          id: "friday-evening",
          flowState: "waiting_internal",
          // Friday 17:00 → the following Monday 09:00 is two working hours, not 64.
          flowStateSince: new Date("2026-08-14T17:00:00+03:00").toISOString(),
        }),
      ],
      events: [],
      settings,
      now: new Date("2026-08-17T09:00:00+03:00"),
    });
    expect(overWeekend.items[0].workingDays).toBe(0.2);
  });
});

describe("aging work in progress", () => {
  it("plots open items by queue age and withholds percentiles until there is a sample", () => {
    const thin = agingWip({
      commitments: [commitment({ id: "open-1", firstReadyAt: at(6) })],
      events: [],
      settings,
      now: NOW,
    });
    expect(thin.items).toHaveLength(1);
    expect(thin.items[0].queueAgeDays).toBeGreaterThan(0);
    expect(thin.percentiles).toBeNull();
  });

  it("derives percentiles from closed items once five have completed", () => {
    const closed = [2, 4, 6, 8, 20].map((days, i) =>
      commitment({
        id: `done-${i}`,
        flowState: "done",
        firstReadyAt: at(days + 1),
        resolvedAt: at(1),
      }),
    );
    const result = agingWip({ commitments: closed, events: [], settings, now: NOW });
    expect(result.items).toHaveLength(0);
    expect(result.sampleSize).toBe(5);
    expect(result.percentiles!.p95).toBeGreaterThan(result.percentiles!.p50);
  });

  it("leaves proposed items out — an unconfirmed item has no queue clock", () => {
    const result = agingWip({
      commitments: [commitment({ id: "proposed-1", flowState: "proposed", firstReadyAt: null })],
      events: [],
      settings,
      now: NOW,
    });
    expect(result.items).toHaveLength(0);
  });
});

describe("flow summary", () => {
  const events: FlowEvent[] = [
    { commitmentId: "still-waiting", fromState: null, toState: "ready", createdAt: at(20) },
    {
      commitmentId: "still-waiting",
      fromState: "ready",
      toState: "waiting_external",
      createdAt: at(15),
    },
    { commitmentId: "cleared", fromState: null, toState: "ready", createdAt: at(20) },
    {
      commitmentId: "cleared",
      fromState: "ready",
      toState: "waiting_internal",
      createdAt: at(14),
    },
    { commitmentId: "cleared", fromState: "waiting_internal", toState: "active", createdAt: at(2) },
  ];

  const commitments: FlowCommitment[] = [
    commitment({
      id: "still-waiting",
      flowState: "waiting_external",
      flowStateSince: at(15),
      costOfDelayBand: "critical",
      waitingOnLabel: "Northgate IT",
      firstReadyAt: at(20),
      createdAt: at(20),
    }),
    commitment({
      id: "cleared",
      flowState: "active",
      flowStateSince: at(2),
      firstReadyAt: at(20),
      createdAt: at(20),
    }),
  ];

  const summary = flowSummary({ commitments, events, settings, now: NOW });

  it("names the longest wait and who holds it", () => {
    expect(summary.longestWait?.commitmentId).toBe("still-waiting");
    expect(summary.longestWait?.holderLabel).toBe("Northgate IT");
  });

  it("counts what left a waiting state this week as the positive counterpart", () => {
    expect(summary.unblockedThisWeek).toBe(1);
  });

  it("reads flow debt from the event log, so the trend is a real comparison", () => {
    // A week ago both items were waiting; the delta must reflect that.
    expect(summary.flowDebt.previousTeamDays).toBeGreaterThan(0);
    expect(summary.trend).toHaveLength(12);
    expect(summary.trend.at(-1)!.teamDays).toBe(summary.waitingNow.teamDays);
  });

  it("treats a WIP limit as advisory only", () => {
    const advisory = flowSummary({ commitments, events, settings, now: NOW, wipLimit: 1 });
    expect(advisory.wip.exceeded).toBe(true);
    expect(flowSummary({ commitments, events, settings, now: NOW }).wip.exceeded).toBe(false);
  });
});

describe("waiting team-days at a point in time", () => {
  it("reconstructs state from the event log rather than the flow_state cache", () => {
    const events: FlowEvent[] = [
      { commitmentId: "x", fromState: null, toState: "ready", createdAt: at(30) },
      { commitmentId: "x", fromState: "ready", toState: "waiting_internal", createdAt: at(20) },
      { commitmentId: "x", fromState: "waiting_internal", toState: "done", createdAt: at(10) },
    ];
    const commitments = [
      commitment({ id: "x", flowState: "done", flowStateSince: at(10), resolvedAt: at(10) }),
    ];
    expect(waitingTeamDaysAt({ commitments, events, settings, now: NOW }, NOW).itemCount).toBe(0);
    expect(
      waitingTeamDaysAt(
        { commitments, events, settings },
        new Date(NOW.getTime() - 15 * DAY),
      ).itemCount,
    ).toBe(1);
  });
});
