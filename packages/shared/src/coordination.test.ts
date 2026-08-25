import { describe, expect, it } from "vitest";
import {
  COORDINATION_MODES,
  COORDINATION_PROFILES,
  agingBand,
  applyVocabulary,
  checkinPlan,
  coordinationPlan,
  coordinationProfile,
  defaultModeForHeadcount,
  escalationPlan,
  inferCoordinationMode,
  isCoordinationMode,
  unresolvedVocabularyKeys,
  vocab,
  type CoordinationItem,
  type CoordinationMode,
} from "./coordination.js";

/**
 * §3.5's fixture: the same five commitments, run through all five modes.
 * "If two modes produce identical output for that fixture, the feature is not
 * implemented." Every assertion below exists to make that statement checkable.
 */
const FIXTURE: CoordinationItem[] = [
  {
    id: "c1-brief",
    title: "Draft the onboarding brief",
    flowState: "active",
    stateWorkingDays: 4,
    workingDaysSinceCheckin: null,
    checkinsThisWeek: 0,
    committedDate: null,
    pastCommittedWorkingDays: 0,
    processStepSlaDays: null,
    awaitingPrincipalDecision: false,
    atDeliverableBoundary: false,
    deliverableVarianceBeyondThreshold: false,
    crossesProfessionalBoundary: false,
    escalationsSoFar: 0,
  },
  {
    id: "c2-client-filing",
    title: "File the client submission",
    flowState: "waiting_internal",
    stateWorkingDays: 3,
    workingDaysSinceCheckin: 6,
    checkinsThisWeek: 0,
    committedDate: "2026-08-18",
    pastCommittedWorkingDays: 2,
    processStepSlaDays: null,
    awaitingPrincipalDecision: false,
    atDeliverableBoundary: false,
    deliverableVarianceBeyondThreshold: false,
    crossesProfessionalBoundary: true,
    escalationsSoFar: 0,
  },
  {
    id: "c3-pricing-call",
    title: "Approve the revised pricing",
    flowState: "waiting_decision",
    stateWorkingDays: 2,
    workingDaysSinceCheckin: 1,
    checkinsThisWeek: 1,
    committedDate: null,
    pastCommittedWorkingDays: 0,
    processStepSlaDays: null,
    awaitingPrincipalDecision: true,
    atDeliverableBoundary: false,
    deliverableVarianceBeyondThreshold: false,
    crossesProfessionalBoundary: false,
    escalationsSoFar: 0,
  },
  {
    id: "c4-claim-step",
    title: "Verification step on claim 4471",
    flowState: "active",
    stateWorkingDays: 6,
    workingDaysSinceCheckin: null,
    checkinsThisWeek: 0,
    committedDate: null,
    pastCommittedWorkingDays: 0,
    processStepSlaDays: 4,
    awaitingPrincipalDecision: false,
    atDeliverableBoundary: false,
    deliverableVarianceBeyondThreshold: false,
    crossesProfessionalBoundary: false,
    escalationsSoFar: 0,
  },
  {
    id: "c5-q3-pack",
    title: "Q3 division pack",
    flowState: "review",
    stateWorkingDays: 1,
    workingDaysSinceCheckin: 2,
    checkinsThisWeek: 0,
    committedDate: "2026-08-31",
    pastCommittedWorkingDays: 0,
    processStepSlaDays: null,
    awaitingPrincipalDecision: false,
    atDeliverableBoundary: true,
    deliverableVarianceBeyondThreshold: true,
    crossesProfessionalBoundary: false,
    escalationsSoFar: 0,
  },
];

const dueIds = (mode: CoordinationMode) =>
  checkinPlan(mode, FIXTURE)
    .filter((d) => d.due)
    .map((d) => d.commitmentId);

const escalatedIds = (mode: CoordinationMode) =>
  escalationPlan(mode, FIXTURE)
    .filter((d) => d.escalate)
    .map((d) => d.commitmentId);

describe("five modes, one fixture — §3.5", () => {
  it("produces a materially different plan for every mode", () => {
    const plans = COORDINATION_MODES.map((m) => JSON.stringify(coordinationPlan(m, FIXTURE)));
    expect(new Set(plans).size).toBe(COORDINATION_MODES.length);
  });

  it("asks about different items in each mode", () => {
    expect(dueIds("mutual_adjustment")).toEqual(["c1-brief", "c2-client-filing", "c4-claim-step"]);
    expect(dueIds("direct_supervision")).toEqual(["c3-pricing-call"]);
    expect(dueIds("standardized_process")).toEqual(["c4-claim-step"]);
    expect(dueIds("standardized_outputs")).toEqual(["c5-q3-pack"]);
    expect(dueIds("standardized_skills")).toEqual(["c2-client-filing"]);
  });

  it("escalates different items in each mode", () => {
    expect(escalatedIds("mutual_adjustment")).toEqual(["c2-client-filing"]);
    expect(escalatedIds("direct_supervision")).toEqual(["c3-pricing-call"]);
    expect(escalatedIds("standardized_process")).toEqual(["c4-claim-step"]);
    expect(escalatedIds("standardized_outputs")).toEqual(["c5-q3-pack"]);
    expect(escalatedIds("standardized_skills")).toEqual(["c2-client-filing"]);
  });

  it("routes escalations somewhere different in each mode", () => {
    const routes = COORDINATION_MODES.map((m) => coordinationProfile(m).escalation.route);
    expect(routes).toEqual([
      "topic_owner",
      "principal",
      "process_owner",
      "division_head",
      "coordinator",
    ]);
    expect(new Set(routes).size).toBe(5);
  });

  it("leads the report with a different section in each mode", () => {
    const leads = COORDINATION_MODES.map((m) => coordinationProfile(m).report.sections[1]);
    expect(leads).toEqual([
      "flow",
      "decision_queue",
      "process_conformance",
      "output_variance",
      "matter_commitments",
    ]);
    const shapes = COORDINATION_MODES.map((m) =>
      coordinationProfile(m).report.sections.join(","),
    );
    expect(new Set(shapes).size).toBe(5);
  });

  it("gives every mode its own aging thresholds", () => {
    const thresholds = COORDINATION_MODES.map(
      (m) => `${COORDINATION_PROFILES[m].aging.amberDays}/${COORDINATION_PROFILES[m].aging.redDays}`,
    );
    expect(new Set(thresholds).size).toBe(5);
  });

  it("bands the same item differently by mode", () => {
    // Three working days waiting: already red under a principal, still fine to
    // a professional practice.
    expect(agingBand("direct_supervision", 3)).toBe("red");
    expect(agingBand("mutual_adjustment", 3)).toBe("amber");
    expect(agingBand("standardized_skills", 3)).toBe("ok");
  });

  it("reads the step SLA rather than the profile in standardized_process", () => {
    expect(agingBand("standardized_process", 3)).toBe("amber");
    expect(agingBand("standardized_process", 3, 10)).toBe("ok");
    expect(agingBand("standardized_process", 18, 10)).toBe("red");
  });
});

describe("§3.4 the standardized_skills hard rules", () => {
  const profile = COORDINATION_PROFILES.standardized_skills;

  it("never allows a supervisory escalation route", () => {
    expect(profile.escalation.allowSupervisoryRoute).toBe(false);
    expect(profile.escalation.route).toBe("coordinator");
    for (const d of escalationPlan("standardized_skills", FIXTURE)) {
      expect(d.allowSupervisoryRoute).toBe(false);
      expect(d.route).toBe("coordinator");
    }
    // Every other mode may route to a supervisor; only this one may not.
    const others = COORDINATION_MODES.filter((m) => m !== "standardized_skills");
    expect(others.every((m) => COORDINATION_PROFILES[m].escalation.allowSupervisoryRoute)).toBe(true);
  });

  it("never says overdue", () => {
    const words = Object.values(profile.vocabulary).join(" ").toLowerCase();
    expect(words).not.toContain("overdue");
    expect(profile.vocabulary.past_date).toBe("Past committed date");
  });

  it("never asks about work internal to the professional", () => {
    const internal = checkinPlan("standardized_skills", FIXTURE).find(
      (d) => d.commitmentId === "c1-brief",
    );
    expect(internal?.due).toBe(false);
    expect(internal?.reason).toContain("never asked about");
  });

  it("asks the coordinator, not the professional, and at most once a week", () => {
    expect(profile.checkin.audience).toBe("coordinator");
    expect(profile.checkin.maxPerItemPerWeek).toBe(1);
    expect(profile.checkin.intervalWorkingDays).toBe(5);
  });

  it("escalates once and never repeats", () => {
    expect(profile.escalation.maxEscalations).toBe(1);
    const alreadyEscalated = FIXTURE.map((i) =>
      i.id === "c2-client-filing" ? { ...i, escalationsSoFar: 1 } : i,
    );
    const decision = escalationPlan("standardized_skills", alreadyEscalated).find(
      (d) => d.commitmentId === "c2-client-filing",
    );
    expect(decision?.escalate).toBe(false);
    expect(decision?.reason).toContain("Ladder exhausted");
  });
});

describe("caps and stops", () => {
  it("respects the per-item weekly check-in cap", () => {
    const capped = FIXTURE.map((i) => ({ ...i, checkinsThisWeek: 9 }));
    expect(checkinPlan("mutual_adjustment", capped).every((d) => !d.due)).toBe(true);
  });

  it("never asks about a proposed item", () => {
    const proposed = [{ ...FIXTURE[0], flowState: "proposed" as const }];
    expect(checkinPlan("mutual_adjustment", proposed)[0].due).toBe(false);
  });

  it("stops the ladder after three escalations in the other four modes", () => {
    for (const mode of COORDINATION_MODES.filter((m) => m !== "standardized_skills")) {
      const exhausted = FIXTURE.map((i) => ({ ...i, escalationsSoFar: 3 }));
      expect(escalationPlan(mode, exhausted).every((d) => !d.escalate)).toBe(true);
    }
  });

  it("never returns a tone without escalating", () => {
    for (const mode of COORDINATION_MODES) {
      for (const d of escalationPlan(mode, FIXTURE)) {
        expect(d.tone === null).toBe(!d.escalate);
      }
    }
  });
});

describe("§7.8 vocabulary substitution", () => {
  it("gives each key a distinct value across modes for the words that matter", () => {
    const pastDate = COORDINATION_MODES.map((m) => vocab(m, "past_date"));
    expect(pastDate).toEqual([
      "Past its date",
      "Still open",
      "SLA breached",
      "Behind plan",
      "Past committed date",
    ]);
    expect(new Set(pastDate).size).toBe(5);
  });

  it("substitutes tokens in template text without touching WhatsApp variables", () => {
    const template = "{{owner}} — *{{1}}* is {{blocked}}. {{escalate}}?";
    expect(applyVocabulary(template, "mutual_adjustment")).toBe(
      "Owner — *{{1}}* is Waiting. Ask someone else?",
    );
    expect(applyVocabulary(template, "standardized_process")).toBe(
      "Step owner — *{{1}}* is Stalled. Raise to process owner?",
    );
  });

  it("leaves an unknown token alone and reports it, rather than rendering a raw key", () => {
    const text = "{{waiting}} {{not_a_key}}";
    expect(applyVocabulary(text, "mutual_adjustment")).toBe("Waiting on {{not_a_key}}");
    expect(unresolvedVocabularyKeys(applyVocabulary(text, "mutual_adjustment"))).toEqual([
      "not_a_key",
    ]);
  });

  it("defines every key in every mode", () => {
    for (const mode of COORDINATION_MODES) {
      for (const value of Object.values(COORDINATION_PROFILES[mode].vocabulary)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("§3.2 defaults and §3.6 inference", () => {
  it("defaults by headcount and asks in the band where headcount does not tell you", () => {
    expect(defaultModeForHeadcount(12)).toBe("mutual_adjustment");
    expect(defaultModeForHeadcount(400)).toBe("standardized_process");
    expect(defaultModeForHeadcount(120)).toBeNull();
  });

  it("lets the professional question override everything", () => {
    const inferred = inferCoordinationMode({
      decisions: "defined_process",
      procedure: "most",
      professionals: true,
    });
    expect(inferred.mode).toBe("standardized_skills");
    expect(inferred.source).toBe("inferred");
    expect(inferred.rationale).toContain("qualified professionals");
  });

  it("maps the decision question when nothing overrides it", () => {
    expect(
      inferCoordinationMode({ decisions: "peers_talk", procedure: "some", professionals: false })
        .mode,
    ).toBe("mutual_adjustment");
    expect(
      inferCoordinationMode({
        decisions: "one_person_decides",
        procedure: "some",
        professionals: false,
      }).mode,
    ).toBe("direct_supervision");
    expect(
      inferCoordinationMode({
        decisions: "each_unit_decides",
        procedure: "some",
        professionals: false,
      }).mode,
    ).toBe("standardized_outputs");
  });

  it("lets a repeatable procedure pull informal coordination toward process", () => {
    expect(
      inferCoordinationMode({ decisions: "peers_talk", procedure: "most", professionals: false })
        .mode,
    ).toBe("standardized_process");
  });

  it("lets bespoke work pull an approval chain back toward informal", () => {
    expect(
      inferCoordinationMode({
        decisions: "defined_process",
        procedure: "almost_none",
        professionals: false,
      }).mode,
    ).toBe("mutual_adjustment");
  });
});

describe("profile lookup", () => {
  it("recognises the five modes and nothing else", () => {
    expect(COORDINATION_MODES.every(isCoordinationMode)).toBe(true);
    expect(isCoordinationMode("hierarchy")).toBe(false);
  });

  it("falls back to the default rather than throwing on a pre-B4 tenant row", () => {
    expect(coordinationProfile(null).mode).toBe("mutual_adjustment");
    expect(coordinationProfile("nonsense").mode).toBe("mutual_adjustment");
  });

  it("gives every mode copy an admin can read", () => {
    for (const mode of COORDINATION_MODES) {
      const p = COORDINATION_PROFILES[mode];
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.typicalOrganization.length).toBeGreaterThan(0);
      expect(p.survey.topics.length).toBeGreaterThan(0);
    }
  });
});
