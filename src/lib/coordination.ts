/**
 * Mirrors @loop/shared coordination profiles for the SPA without pulling Node
 * barrels — 03_COORDINATION_MODES.md §3.2, §3.3, §3.6.
 *
 * Only what `/onboarding/coordination` and `/settings/coordination` render:
 * the five modes, the plain-language summary of what each one changes, the
 * vocabulary samples for the preview, and the three-question inference. The
 * behavioural numbers themselves live server-side in `coordination.ts`, which
 * is the single place any scheduler, aging or escalation decision reads.
 */

export type CoordinationMode =
  | "mutual_adjustment"
  | "direct_supervision"
  | "standardized_process"
  | "standardized_outputs"
  | "standardized_skills";

export type CoordinationModeSource = "default" | "inferred" | "chosen";

export const COORDINATION_MODES: CoordinationMode[] = [
  "mutual_adjustment",
  "direct_supervision",
  "standardized_process",
  "standardized_outputs",
  "standardized_skills",
];

export const DEFAULT_COORDINATION_MODE: CoordinationMode = "mutual_adjustment";

export interface CoordinationModeCopy {
  label: string;
  description: string;
  typicalOrganization: string;
  /** The rows of the "what changes" preview. Each is a real code path (§3.3). */
  changes: {
    checkins: string;
    aging: string;
    escalation: string;
    report: string;
  };
  /** §7.8 samples, so an admin can see the words change before they commit. */
  vocabulary: { past_date: string; owner: string; escalate: string };
}

export const COORDINATION_COPY: Record<CoordinationMode, CoordinationModeCopy> = {
  mutual_adjustment: {
    label: "Peer coordination",
    description:
      "People sort things out directly with whoever is involved. Loop speeds that up — it finds who to ask, and asks for you.",
    typicalOrganization: "Agencies, consultancies, studios, startups, product and R&D teams",
    changes: {
      checkins: "Light and frequent — every 3 working days on anything open, at most twice a week per item.",
      aging: "Amber at 2 working days waiting, red at 4.",
      escalation: "After 2 working days waiting, sideways to whoever owns the topic.",
      report: "Led by where time went — waiting, blockers, and where handoffs stall.",
    },
    vocabulary: { past_date: "Past its date", owner: "Owner", escalate: "Ask someone else" },
  },
  direct_supervision: {
    label: "One decision-maker",
    description:
      "One person directs the work and makes the calls. Loop keeps them unblocked and surfaces only what actually needs them.",
    typicalOrganization: "Owner-led small businesses, founding teams, single-partner practices",
    changes: {
      checkins: "Only when the principal is the blocker or the decision. Never periodic.",
      aging: "Amber at 1 working day, red at 2.",
      escalation: "After 1 day undecided, always to the principal.",
      report: "Led by the decision queue — what is waiting on you.",
    },
    vocabulary: { past_date: "Still open", owner: "Owner", escalate: "Raise to the principal" },
  },
  standardized_process: {
    label: "Defined process",
    description:
      "Work follows defined procedures. Loop detects deviation from the process and shows where it stalls — it never asks for a periodic status.",
    typicalOrganization: "Operations, back office, manufacturing, claims, logistics, shared services",
    changes: {
      checkins: "Exception-only. Asked when a step runs past its expected time, and not otherwise.",
      aging: "From each step's own SLA, not a fixed number of days.",
      escalation: "On SLA breach, to the owner of that step.",
      report: "Led by process conformance — step cycle times and SLA breaches.",
    },
    vocabulary: { past_date: "SLA breached", owner: "Step owner", escalate: "Raise to process owner" },
  },
  standardized_outputs: {
    label: "Measured deliverables",
    description:
      "Each unit runs itself and is measured on what it delivers. Loop rolls up output variance per division without touching how a division works.",
    typicalOrganization: "Multi-division companies, franchise groups, holding structures",
    changes: {
      checkins: "At deliverable boundaries only, at most once a week per item.",
      aging: "Amber at 4 working days, red at 8.",
      escalation: "On variance beyond threshold, to the division head.",
      report: "Led by output variance per division. Intra-division work is not shown.",
    },
    vocabulary: { past_date: "Behind plan", owner: "Accountable", escalate: "Raise to division head" },
  },
  standardized_skills: {
    label: "Professional judgement",
    description:
      "Qualified professionals decide how their own work is done. Loop tracks only what is owed across a boundary — to a client, another team, a court, a regulator.",
    typicalOrganization: "Law, medicine, audit, engineering practices, universities",
    changes: {
      checkins:
        "Only on commitments owed outside the practice, at most once a week. Loop never asks a professional about the conduct of their own work.",
      aging: "Lenient — amber at 5 working days, red at 10.",
      escalation:
        "Once, when an item passes its committed date, and always to a coordinator. Never to anyone who could be read as supervising professional judgement.",
      report: "Led by client and matter commitments and their dates.",
    },
    vocabulary: {
      past_date: "Past committed date",
      owner: "Responsible",
      escalate: "Refer to coordinator",
    },
  },
};

export function isCoordinationMode(value: unknown): value is CoordinationMode {
  return typeof value === "string" && (COORDINATION_MODES as string[]).includes(value);
}

export function coordinationCopy(mode: unknown): CoordinationModeCopy {
  return COORDINATION_COPY[isCoordinationMode(mode) ? mode : DEFAULT_COORDINATION_MODE];
}

/** §3.6 — three plain questions. Nobody is asked what a coordination mechanism is. */
export type DecisionAnswer =
  | "peers_talk"
  | "one_person_decides"
  | "defined_process"
  | "each_unit_decides";
export type ProcedureAnswer = "almost_none" | "some" | "most";

export interface CoordinationAnswers {
  decisions: DecisionAnswer;
  procedure: ProcedureAnswer;
  professionals: boolean;
}

const DECISION_MODE: Record<DecisionAnswer, CoordinationMode> = {
  peers_talk: "mutual_adjustment",
  one_person_decides: "direct_supervision",
  defined_process: "standardized_process",
  each_unit_decides: "standardized_outputs",
};

const DECISION_RATIONALE: Record<DecisionAnswer, string> = {
  peers_talk: "Decisions happen between whoever is involved.",
  one_person_decides: "Decisions go to one person.",
  defined_process: "Decisions follow a defined process or approval chain.",
  each_unit_decides: "Each unit decides for itself.",
};

export interface CoordinationInference {
  mode: CoordinationMode;
  rationale: string;
}

export function inferCoordinationMode(answers: CoordinationAnswers): CoordinationInference {
  if (answers.professionals) {
    return {
      mode: "standardized_skills",
      rationale: "Most of the team are qualified professionals who decide how their own work is done.",
    };
  }
  const base = DECISION_MODE[answers.decisions];
  if (answers.procedure === "most" && base === "mutual_adjustment") {
    return {
      mode: "standardized_process",
      rationale: "People coordinate informally, but most of the work follows a repeatable procedure.",
    };
  }
  if (answers.procedure === "almost_none" && base === "standardized_process") {
    return {
      mode: "mutual_adjustment",
      rationale: "There is an approval chain, but almost no work is repeatable — every job is different.",
    };
  }
  return { mode: base, rationale: DECISION_RATIONALE[answers.decisions] };
}

export const DECISION_OPTIONS: { value: DecisionAnswer; label: string }[] = [
  { value: "peers_talk", label: "They just talk to whoever's involved" },
  { value: "one_person_decides", label: "It goes to one person who decides" },
  { value: "defined_process", label: "There's a defined process or approval chain" },
  { value: "each_unit_decides", label: "Each unit decides for itself" },
];

export const PROCEDURE_OPTIONS: { value: ProcedureAnswer; label: string }[] = [
  { value: "almost_none", label: "Almost none — every job is different" },
  { value: "some", label: "Some of it" },
  { value: "most", label: "Most of it" },
];
