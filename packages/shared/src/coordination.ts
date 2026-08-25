/**
 * B4 coordination modes — 03_COORDINATION_MODES.md §3.2–§3.6.
 *
 * The cross-industry variable. A 40-person architecture practice and a
 * 40-person marketing agency coordinate almost identically; a 40-person
 * architecture practice and a 40-person payments-operations team do not. That
 * difference is `tenant_settings.coordination_mode`, and it is the only knob
 * that changes product behaviour at this depth.
 *
 * Every consumer reads the profile: the scheduler's check-in eligibility, the
 * aging computation in `flow.ts`, the escalation engine, message template
 * selection, the survey generator and the report renderer. **No consumer
 * hardcodes a number** — if a threshold appears anywhere else, the mode has
 * stopped meaning anything.
 *
 * Pure functions over plain data, as with the rest of this package. Nothing
 * here reads the database or the clock.
 */

import { isOpenState, isWaitingState, type FlowState } from "./flow.js";

/** §3.2. Mintzberg's five coordinating mechanisms, in the product's terms. */
export type CoordinationMode =
  | "mutual_adjustment"
  | "direct_supervision"
  | "standardized_process"
  | "standardized_outputs"
  | "standardized_skills";

export const COORDINATION_MODES: readonly CoordinationMode[] = [
  "mutual_adjustment",
  "direct_supervision",
  "standardized_process",
  "standardized_outputs",
  "standardized_skills",
];

export const DEFAULT_COORDINATION_MODE: CoordinationMode = "mutual_adjustment";

/**
 * §3.6. `default` is not in the doc's two-value list: it marks a tenant that
 * predates `/onboarding/coordination` and was never asked, so it can be
 * excluded when scoring whether the inference is any good.
 */
export type CoordinationModeSource = "default" | "inferred" | "chosen";

export type CheckinStrategy = "periodic" | "exception_only" | "boundary_only";
export type CheckinRegister = "colloquial" | "terse" | "procedural" | "formal";

/** §3.3 "Who is asked". Never the professional in `standardized_skills`. */
export type CheckinAudience = "owner" | "step_owner" | "division_lead" | "coordinator";

export type AgingSource = "fixed" | "process_step";

export type EscalationTrigger =
  | "blocked_or_waiting"
  | "undecided"
  | "sla_breach"
  | "variance"
  | "past_committed";

export type EscalationRoute =
  | "topic_owner"
  | "principal"
  | "process_owner"
  | "division_head"
  | "coordinator";

export type ExtractionScope = "all" | "process_linked" | "cross_boundary_only";

/** §3.3 "Default ownership map" — what the seeded map is keyed by. */
export type OwnershipSeed =
  | "topic_keyword"
  | "principal"
  | "process_step"
  | "division"
  | "matter_type";

/**
 * Report sections — 10_REPORTING.md §10.2, plus the five mode-specific
 * emphasis sections from §3.3 "Report emphasis". Exactly one emphasis section
 * appears per mode, and it always leads.
 */
export type ReportSection =
  | "headline"
  | "flow"
  | "decision_queue"
  | "process_conformance"
  | "output_variance"
  | "matter_commitments"
  | "needs_decision"
  | "project_health"
  | "what_moved"
  | "team_pulse"
  | "data_quality";

/** §7.8. Keys are fixed; values vary by mode. Never render a raw key. */
export type VocabularyKey =
  | "waiting"
  | "past_date"
  | "owner"
  | "escalate"
  | "checkin"
  | "blocked";

export const VOCABULARY_KEYS: readonly VocabularyKey[] = [
  "waiting",
  "past_date",
  "owner",
  "escalate",
  "checkin",
  "blocked",
];

export type CoordinationProfile = {
  mode: CoordinationMode;
  label: string;
  /** The one-line description shown at onboarding and `/settings/coordination`. */
  description: string;
  /** Who this looks like, in the admin's own words rather than Mintzberg's. */
  typicalOrganization: string;
  checkin: {
    strategy: CheckinStrategy;
    intervalWorkingDays: number | null;
    maxPerItemPerWeek: number;
    register: CheckinRegister;
    audience: CheckinAudience;
  };
  aging: { amberDays: number; redDays: number; source: AgingSource };
  escalation: {
    trigger: EscalationTrigger;
    route: EscalationRoute;
    /** false for `standardized_skills` (§3.4). */
    allowSupervisoryRoute: boolean;
    /** §3.3 escalation tone. A fixed opening line — never model output. */
    tone: string;
    /** Working days in the trigger condition before the ladder starts. */
    graceWorkingDays: number;
    /** §5.6 stop-after-three; `standardized_skills` escalates once, never twice. */
    maxEscalations: number;
  };
  extraction: { minConfidence: number; scope: ExtractionScope };
  ownership: { seed: OwnershipSeed };
  survey: { topics: readonly string[] };
  report: { sections: readonly ReportSection[] };
  vocabulary: Readonly<Record<VocabularyKey, string>>;
};

/**
 * §3.3, one column per mode. This table is the feature. If two rows converge,
 * the mode has stopped earning its place and the snapshot test fails.
 */
export const COORDINATION_PROFILES: Readonly<Record<CoordinationMode, CoordinationProfile>> = {
  mutual_adjustment: {
    mode: "mutual_adjustment",
    label: "Peer coordination",
    description:
      "People sort things out directly with whoever is involved. Loop speeds that up — it finds who to ask, and asks for you.",
    typicalOrganization: "Agencies, consultancies, studios, startups, product and R&D teams",
    checkin: {
      strategy: "periodic",
      intervalWorkingDays: 3,
      maxPerItemPerWeek: 2,
      register: "colloquial",
      audience: "owner",
    },
    aging: { amberDays: 2, redDays: 4, source: "fixed" },
    escalation: {
      trigger: "blocked_or_waiting",
      route: "topic_owner",
      allowSupervisoryRoute: true,
      tone: "Can you help unblock this?",
      graceWorkingDays: 2,
      maxEscalations: 3,
    },
    // High aggressiveness: informal commitments in conversation are the point,
    // and a false positive costs one dismissed nudge.
    extraction: { minConfidence: 0.6, scope: "all" },
    ownership: { seed: "topic_keyword" },
    survey: { topics: ["blockers", "clarity", "dependencies"] },
    report: {
      sections: [
        "headline",
        "flow",
        "needs_decision",
        "project_health",
        "what_moved",
        "team_pulse",
        "data_quality",
      ],
    },
    vocabulary: {
      waiting: "Waiting on",
      past_date: "Past its date",
      owner: "Owner",
      escalate: "Ask someone else",
      checkin: "Check-in",
      blocked: "Waiting",
    },
  },

  direct_supervision: {
    mode: "direct_supervision",
    label: "One decision-maker",
    description:
      "One person directs the work and makes the calls. Loop keeps them unblocked and surfaces only what actually needs them.",
    typicalOrganization: "Owner-led small businesses, founding teams, single-partner practices",
    checkin: {
      // Never periodic: the principal is the bottleneck, so anything that is
      // not waiting on them is noise to them and pressure to everyone else.
      strategy: "exception_only",
      intervalWorkingDays: null,
      maxPerItemPerWeek: 3,
      register: "terse",
      audience: "owner",
    },
    aging: { amberDays: 1, redDays: 2, source: "fixed" },
    escalation: {
      trigger: "undecided",
      route: "principal",
      allowSupervisoryRoute: true,
      tone: "Needs your call.",
      graceWorkingDays: 1,
      maxEscalations: 3,
    },
    extraction: { minConfidence: 0.7, scope: "all" },
    ownership: { seed: "principal" },
    survey: { topics: ["decision latency", "clarity"] },
    // No team_pulse: C-2's n ≥ 5 floor almost never clears at this size, and a
    // section that is permanently suppressed teaches people to skip the report.
    report: {
      sections: ["headline", "decision_queue", "needs_decision", "what_moved", "data_quality"],
    },
    vocabulary: {
      waiting: "Waiting on",
      past_date: "Still open",
      owner: "Owner",
      escalate: "Raise to the principal",
      checkin: "Check-in",
      blocked: "Waiting on a decision",
    },
  },

  standardized_process: {
    mode: "standardized_process",
    label: "Defined process",
    description:
      "Work follows defined procedures. Loop detects deviation from the process and shows where it stalls — it never asks for a periodic status.",
    typicalOrganization: "Operations, back office, manufacturing, claims, logistics, shared services",
    checkin: {
      strategy: "exception_only",
      intervalWorkingDays: null,
      maxPerItemPerWeek: 2,
      register: "procedural",
      audience: "step_owner",
    },
    // Real thresholds come from each step's SLA; these are the fallback for a
    // step with no definition yet, which is why `source` is not 'fixed'.
    aging: { amberDays: 3, redDays: 5, source: "process_step" },
    escalation: {
      trigger: "sla_breach",
      route: "process_owner",
      allowSupervisoryRoute: true,
      tone: "This step has exceeded its SLA.",
      graceWorkingDays: 0,
      maxEscalations: 3,
    },
    // Low aggressiveness: only commitments tied to a defined process step.
    extraction: { minConfidence: 0.85, scope: "process_linked" },
    ownership: { seed: "process_step" },
    survey: { topics: ["process friction", "tooling", "handoffs"] },
    report: {
      sections: [
        "headline",
        "process_conformance",
        "needs_decision",
        "project_health",
        "what_moved",
        "team_pulse",
        "data_quality",
      ],
    },
    vocabulary: {
      waiting: "Held at step",
      past_date: "SLA breached",
      owner: "Step owner",
      escalate: "Raise to process owner",
      checkin: "Status point",
      blocked: "Stalled",
    },
  },

  standardized_outputs: {
    mode: "standardized_outputs",
    label: "Measured deliverables",
    description:
      "Each unit runs itself and is measured on what it delivers. Loop rolls up output variance per division without touching how a division works.",
    typicalOrganization: "Multi-division companies, franchise groups, holding structures",
    checkin: {
      strategy: "boundary_only",
      intervalWorkingDays: null,
      maxPerItemPerWeek: 1,
      register: "formal",
      audience: "division_lead",
    },
    aging: { amberDays: 4, redDays: 8, source: "fixed" },
    escalation: {
      trigger: "variance",
      route: "division_head",
      allowSupervisoryRoute: true,
      tone: "This deliverable is behind plan.",
      graceWorkingDays: 0,
      maxEscalations: 3,
    },
    extraction: { minConfidence: 0.75, scope: "all" },
    ownership: { seed: "division" },
    survey: { topics: ["resourcing", "dependencies between divisions"] },
    // No team_pulse: intra-division work is explicitly out of scope here, and a
    // cross-division sentiment aggregate is not something a division head can act on.
    report: {
      sections: ["headline", "output_variance", "project_health", "what_moved", "data_quality"],
    },
    vocabulary: {
      waiting: "Awaiting delivery",
      past_date: "Behind plan",
      owner: "Accountable",
      escalate: "Raise to division head",
      checkin: "Deliverable review",
      blocked: "Behind plan",
    },
  },

  standardized_skills: {
    mode: "standardized_skills",
    label: "Professional judgement",
    description:
      "Qualified professionals decide how their own work is done. Loop tracks only what is owed across a boundary — to a client, another team, a court, a regulator — and never comments on how the work is done.",
    typicalOrganization: "Law, medicine, audit, engineering practices, universities",
    checkin: {
      // §3.4: at most once per item per week. A tool that nudges a partner about
      // their own work reads as an insult and is off within a week.
      strategy: "periodic",
      intervalWorkingDays: 5,
      maxPerItemPerWeek: 1,
      register: "formal",
      audience: "coordinator",
    },
    // Lenient: professional work is lumpier, and an amber at two days is noise.
    aging: { amberDays: 5, redDays: 10, source: "fixed" },
    escalation: {
      trigger: "past_committed",
      route: "coordinator",
      // §3.4. Escalation never reaches anyone who could be read as supervising
      // a professional's judgement. This is the load-bearing false in the file.
      allowSupervisoryRoute: false,
      tone: "This item is past its committed date. Who should take it?",
      graceWorkingDays: 0,
      // "Once, with no repeat."
      maxEscalations: 1,
    },
    // High precision required: a false commitment addressed to a partner is expensive.
    extraction: { minConfidence: 0.85, scope: "cross_boundary_only" },
    ownership: { seed: "matter_type" },
    survey: { topics: ["administrative load", "information availability"] },
    report: {
      sections: [
        "headline",
        "matter_commitments",
        "needs_decision",
        "what_moved",
        "team_pulse",
        "data_quality",
      ],
    },
    vocabulary: {
      waiting: "Awaiting",
      // §3.4: the word "overdue" does not appear in this mode.
      past_date: "Past committed date",
      owner: "Responsible",
      escalate: "Refer to coordinator",
      checkin: "Update request",
      blocked: "Awaiting input",
    },
  },
};

export function isCoordinationMode(value: unknown): value is CoordinationMode {
  return typeof value === "string" && (COORDINATION_MODES as readonly string[]).includes(value);
}

/**
 * The only way to read mode behaviour. Falls back to the default rather than
 * throwing, because a tenant row that predates B4 must still render.
 */
export function coordinationProfile(mode: unknown): CoordinationProfile {
  return COORDINATION_PROFILES[isCoordinationMode(mode) ? mode : DEFAULT_COORDINATION_MODE];
}

// ─── §3.2 Defaults and §3.6 inference ───────────────────────────────────────

/**
 * §3.2. `mutual_adjustment` under 50 people, `standardized_process` above 250.
 * `null` between the two means "ask" — the band where headcount genuinely does
 * not tell you, and guessing is worse than a question.
 */
export function defaultModeForHeadcount(headcount: number): CoordinationMode | null {
  if (!Number.isFinite(headcount) || headcount <= 0) return DEFAULT_COORDINATION_MODE;
  if (headcount < 50) return "mutual_adjustment";
  if (headcount > 250) return "standardized_process";
  return null;
}

/** §3.6. Three plain questions; nobody is asked what a coordination mechanism is. */
export type CoordinationAnswers = {
  /** "When someone on your team needs a decision, what usually happens?" */
  decisions: "peers_talk" | "one_person_decides" | "defined_process" | "each_unit_decides";
  /** "How much of your team's work follows a defined, repeatable procedure?" */
  procedure: "almost_none" | "some" | "most";
  /** "Are most of your team qualified professionals who decide how their own work gets done?" */
  professionals: boolean;
};

const DECISION_MODE: Record<CoordinationAnswers["decisions"], CoordinationMode> = {
  peers_talk: "mutual_adjustment",
  one_person_decides: "direct_supervision",
  defined_process: "standardized_process",
  each_unit_decides: "standardized_outputs",
};

export type CoordinationInference = {
  mode: CoordinationMode;
  source: "inferred";
  /** Shown under the inferred mode so the admin can tell whether it read them right. */
  rationale: string;
};

export function inferCoordinationMode(answers: CoordinationAnswers): CoordinationInference {
  // Q3 overrides everything. A professional bureaucracy that also has a defined
  // intake process is still a professional bureaucracy, and getting this
  // backwards is the one mistake that makes Loop unsellable in that market (§3.4).
  if (answers.professionals) {
    return {
      mode: "standardized_skills",
      source: "inferred",
      rationale: "Most of the team are qualified professionals who decide how their own work is done.",
    };
  }

  const base = DECISION_MODE[answers.decisions];

  if (answers.procedure === "most" && base === "mutual_adjustment") {
    return {
      mode: "standardized_process",
      source: "inferred",
      rationale: "People coordinate informally, but most of the work follows a repeatable procedure.",
    };
  }

  if (answers.procedure === "almost_none" && base === "standardized_process") {
    return {
      mode: "mutual_adjustment",
      source: "inferred",
      rationale: "There is an approval chain, but almost no work is repeatable — every job is different.",
    };
  }

  const rationale: Record<CoordinationAnswers["decisions"], string> = {
    peers_talk: "Decisions happen between whoever is involved.",
    one_person_decides: "Decisions go to one person.",
    defined_process: "Decisions follow a defined process or approval chain.",
    each_unit_decides: "Each unit decides for itself.",
  };

  return { mode: base, source: "inferred", rationale: rationale[answers.decisions] };
}

// ─── §7.8 Vocabulary substitution, applied at render time ───────────────────

export function vocab(mode: unknown, key: VocabularyKey): string {
  return coordinationProfile(mode).vocabulary[key];
}

/** Mid-sentence form: "3 items {{waiting}} the data team" reads wrong capitalised. */
export function vocabLower(mode: unknown, key: VocabularyKey): string {
  return vocab(mode, key).toLowerCase();
}

const VOCAB_TOKEN = /\{\{([a-z_]+)\}\}/g;

/**
 * Substitutes `{{waiting}}`-style tokens in UI copy and message templates.
 * This is how "overdue" becomes "past committed date" in a law firm without
 * forking the templates. WhatsApp's own `{{1}}` positional variables are
 * numeric and are left untouched.
 */
export function applyVocabulary(text: string, mode: unknown): string {
  const profile = coordinationProfile(mode);
  return text.replace(VOCAB_TOKEN, (whole, key: string) =>
    (VOCABULARY_KEYS as readonly string[]).includes(key)
      ? profile.vocabulary[key as VocabularyKey]
      : whole,
  );
}

/** Guards §7.8's "never render a raw key" against a template with a typo in it. */
export function unresolvedVocabularyKeys(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(VOCAB_TOKEN)) {
    if (!/^\d+$/.test(match[1])) found.push(match[1]);
  }
  return found;
}

// ─── Aging (§3.3), read by the flow engine rather than a constant ───────────

export type AgingBand = "ok" | "amber" | "red";

/**
 * The colour crossing in `WaitingTime` (§7.6) and the aging scatter. In
 * `standardized_process` the step's own SLA wins where one is defined; the
 * profile numbers are the fallback for a step nobody has specified yet.
 */
export function agingBand(
  mode: unknown,
  workingDays: number,
  stepSlaDays?: number | null,
): AgingBand {
  const { aging } = coordinationProfile(mode);
  const amber =
    aging.source === "process_step" && stepSlaDays != null ? stepSlaDays : aging.amberDays;
  const red =
    aging.source === "process_step" && stepSlaDays != null
      ? stepSlaDays * (aging.redDays / aging.amberDays)
      : aging.redDays;
  if (workingDays >= red) return "red";
  if (workingDays >= amber) return "amber";
  return "ok";
}

// ─── The planning surface every consumer calls ──────────────────────────────

/**
 * One commitment as the scheduler and escalation engine see it. Deliberately
 * flat: the store knows where each field comes from, and this module stays
 * testable without a database.
 */
export type CoordinationItem = {
  id: string;
  title: string;
  flowState: FlowState;
  /** Working days in the current flow state. */
  stateWorkingDays: number;
  /** Working days since the last check-in on this item; null if never asked. */
  workingDaysSinceCheckin: number | null;
  checkinsThisWeek: number;
  committedDate: string | null;
  /** Working days past `committedDate`; 0 when it is not past it (§4.6). */
  pastCommittedWorkingDays: number;
  /** §3.3 `standardized_process` — the step's SLA from the process definition. */
  processStepSlaDays: number | null;
  /** §3.3 `direct_supervision` — the principal owes a decision on this. */
  awaitingPrincipalDecision: boolean;
  /** §3.3 `standardized_outputs` — the item sits on a deliverable boundary. */
  atDeliverableBoundary: boolean;
  /** §3.3 `standardized_outputs` — measured variance beyond the division threshold. */
  deliverableVarianceBeyondThreshold: boolean;
  /** §3.4 `standardized_skills` — owed to a client, another team, a court, a regulator. */
  crossesProfessionalBoundary: boolean;
  /** How far up the ladder this item already went (§5.6). */
  escalationsSoFar: number;
};

export type CheckinDecision = {
  commitmentId: string;
  due: boolean;
  /** Plain-language reason, shown in `/settings/coordination`'s preview. */
  reason: string;
  register: CheckinRegister;
  audience: CheckinAudience;
};

export type EscalationDecision = {
  commitmentId: string;
  escalate: boolean;
  reason: string;
  route: EscalationRoute;
  allowSupervisoryRoute: boolean;
  /** Null when not escalating, so a caller cannot accidentally send the tone alone. */
  tone: string | null;
};

function eligibleForAnyCheckin(item: CoordinationItem): boolean {
  // `proposed` has not been accepted by a human yet, so there is nothing to ask about.
  return isOpenState(item.flowState) && item.flowState !== "proposed";
}

/** §3.3 "Check-in cadence" and "Check-in register", per mode. */
export function checkinPlan(mode: unknown, items: readonly CoordinationItem[]): CheckinDecision[] {
  const profile = coordinationProfile(mode);
  const { checkin } = profile;

  return items.map((item) => {
    const base = {
      commitmentId: item.id,
      register: checkin.register,
      audience: checkin.audience,
    };
    const no = (reason: string): CheckinDecision => ({ ...base, due: false, reason });
    const yes = (reason: string): CheckinDecision => ({ ...base, due: true, reason });

    if (!eligibleForAnyCheckin(item)) return no("Not an open, accepted item.");
    if (item.checkinsThisWeek >= checkin.maxPerItemPerWeek) {
      return no(`Already asked ${item.checkinsThisWeek}× this week (cap ${checkin.maxPerItemPerWeek}).`);
    }

    switch (profile.mode) {
      case "mutual_adjustment": {
        const since = item.workingDaysSinceCheckin;
        if (since != null && since < (checkin.intervalWorkingDays ?? 0)) {
          return no(`Asked ${since} working days ago; the interval is ${checkin.intervalWorkingDays}.`);
        }
        return yes(
          since == null
            ? "Open item, never asked."
            : `Open item, ${since} working days since the last check-in.`,
        );
      }

      case "direct_supervision": {
        // Exception-only. Anything the principal is not sitting on is their noise.
        if (!item.awaitingPrincipalDecision && item.flowState !== "waiting_decision") {
          return no("The principal is neither the blocker nor the decision.");
        }
        return yes("The principal owes a decision on this.");
      }

      case "standardized_process": {
        // Exception-only, and never periodic: deviation from the step's expected
        // time is the whole trigger.
        if (item.processStepSlaDays == null) {
          return no("No process step defined for this item.");
        }
        if (item.stateWorkingDays <= item.processStepSlaDays) {
          return no(
            `Within the step's ${item.processStepSlaDays}-day expected time (${item.stateWorkingDays} so far).`,
          );
        }
        return yes(
          `Step has run ${item.stateWorkingDays} working days against a ${item.processStepSlaDays}-day expectation.`,
        );
      }

      case "standardized_outputs": {
        if (!item.atDeliverableBoundary) return no("Not at a deliverable boundary.");
        return yes("At a deliverable boundary.");
      }

      case "standardized_skills": {
        // §3.4: only items owed across a professional boundary, ever.
        if (!item.crossesProfessionalBoundary) {
          return no("Internal to the professional's own work — never asked about.");
        }
        const since = item.workingDaysSinceCheckin;
        if (since != null && since < (checkin.intervalWorkingDays ?? 0)) {
          return no(`Asked ${since} working days ago; at most once per week.`);
        }
        return yes(
          since == null
            ? "Cross-boundary commitment, never asked."
            : `Cross-boundary commitment, ${since} working days since the last request.`,
        );
      }
    }
  });
}

/** §3.3 "Escalation trigger" and "Escalation route", per mode. */
export function escalationPlan(
  mode: unknown,
  items: readonly CoordinationItem[],
): EscalationDecision[] {
  const profile = coordinationProfile(mode);
  const { escalation } = profile;

  return items.map((item) => {
    const base = {
      commitmentId: item.id,
      route: escalation.route,
      allowSupervisoryRoute: escalation.allowSupervisoryRoute,
    };
    const no = (reason: string): EscalationDecision => ({
      ...base,
      escalate: false,
      reason,
      tone: null,
    });
    const yes = (reason: string): EscalationDecision => ({
      ...base,
      escalate: true,
      reason,
      tone: escalation.tone,
    });

    if (!isOpenState(item.flowState)) return no("Item is closed.");
    if (item.escalationsSoFar >= escalation.maxEscalations) {
      // §5.6. A system that keeps nagging after nobody acted has a routing
      // problem, not a persistence problem.
      return no(`Ladder exhausted after ${item.escalationsSoFar} — messaging stops.`);
    }

    switch (escalation.trigger) {
      case "blocked_or_waiting":
        if (!isWaitingState(item.flowState)) return no("Not waiting on anyone.");
        if (item.stateWorkingDays <= escalation.graceWorkingDays) {
          return no(
            `Waiting ${item.stateWorkingDays} working days; the trigger is over ${escalation.graceWorkingDays}.`,
          );
        }
        return yes(`Waiting ${item.stateWorkingDays} working days.`);

      case "undecided":
        if (!item.awaitingPrincipalDecision && item.flowState !== "waiting_decision") {
          return no("Nothing is awaiting the principal.");
        }
        if (item.stateWorkingDays <= escalation.graceWorkingDays) {
          return no(`Undecided for ${item.stateWorkingDays} working days; the trigger is over 1.`);
        }
        return yes(`Undecided for ${item.stateWorkingDays} working days.`);

      case "sla_breach":
        if (item.processStepSlaDays == null) return no("No step SLA to breach.");
        if (item.stateWorkingDays <= item.processStepSlaDays) {
          return no(`Within the step's ${item.processStepSlaDays}-day SLA.`);
        }
        return yes(
          `Step exceeded its ${item.processStepSlaDays}-day SLA at ${item.stateWorkingDays} working days.`,
        );

      case "variance":
        if (!item.deliverableVarianceBeyondThreshold) {
          return no("Deliverable variance is within threshold.");
        }
        return yes("Deliverable variance beyond threshold.");

      case "past_committed":
        // §3.4: nothing else escalates, and it escalates once.
        if (!item.crossesProfessionalBoundary) {
          return no("Not owed across a professional boundary.");
        }
        if (item.pastCommittedWorkingDays <= 0) return no("Not past its committed date.");
        return yes(`Past its committed date by ${item.pastCommittedWorkingDays} working days.`);
    }
  });
}

export type CoordinationPlan = {
  mode: CoordinationMode;
  checkins: CheckinDecision[];
  escalations: EscalationDecision[];
  reportSections: readonly ReportSection[];
  aging: Array<{ commitmentId: string; band: AgingBand }>;
  /** Items the extractor would keep at this mode's confidence and scope. */
  extraction: { minConfidence: number; scope: ExtractionScope };
};

/**
 * The whole of a mode's behaviour over one set of items, in one call. This is
 * what the five-mode snapshot test asserts on, and what
 * `/settings/coordination` previews before an admin switches mode.
 */
export function coordinationPlan(
  mode: unknown,
  items: readonly CoordinationItem[],
): CoordinationPlan {
  const profile = coordinationProfile(mode);
  return {
    mode: profile.mode,
    checkins: checkinPlan(profile.mode, items),
    escalations: escalationPlan(profile.mode, items),
    reportSections: profile.report.sections,
    aging: items.map((item) => ({
      commitmentId: item.id,
      band: agingBand(profile.mode, item.stateWorkingDays, item.processStepSlaDays),
    })),
    extraction: profile.extraction,
  };
}
