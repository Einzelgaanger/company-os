/**
 * B7 report sections — 10_REPORTING.md §10.2, §10.3, with the per-mode
 * emphasis and vocabulary from 03_COORDINATION_MODES.md §3.3 and §7.8.
 *
 * The renderer never picks its own headings. It asks for the tenant's section
 * list and gets titles, captions and column labels already substituted, so a
 * law firm's report says "Past committed date" everywhere the agency's says
 * "Past its date" — without a forked template.
 *
 * Numbers are computed in SQL (§10.1); nothing here touches a figure.
 */

import {
  applyVocabulary,
  coordinationProfile,
  vocab,
  type CoordinationMode,
  type ReportSection,
} from "./coordination.js";

export type ReportSectionSpec = {
  key: ReportSection;
  title: string;
  /** One line saying what the section shows and what to do about it (§7.7). */
  caption: string;
  /** Column and figure labels, vocabulary already applied. */
  labels: Readonly<Record<string, string>>;
  /** §10.4 — `team_pulse` is org-scope only, and only above the C-2 floor. */
  orgScopeOnly: boolean;
};

/** §10.2. Titles and captions carry `{{key}}` tokens where the mode changes the word. */
const SECTION_COPY: Record<ReportSection, { title: string; caption: string; orgScopeOnly?: boolean }> = {
  headline: {
    title: "Headline",
    caption: "One paragraph, written from the computed figures below.",
  },
  flow: {
    title: "Where time went",
    caption: "Team-days sitting still, split by type and by the queue holding them.",
  },
  decision_queue: {
    title: "Your decision queue",
    caption: "Everything that cannot move until you call it. Longest first.",
  },
  process_conformance: {
    title: "Process conformance",
    caption: "Step cycle times against their SLAs, and where the process stalls.",
  },
  output_variance: {
    title: "Output variance by division",
    caption: "Delivered against plan per division. Intra-division work is not shown.",
  },
  matter_commitments: {
    title: "Client and matter commitments",
    caption: "Only what is owed across a boundary, and the dates committed to.",
  },
  needs_decision: {
    title: "Needs a decision",
    caption: "Open escalations and exhausted routes. Capped at 10.",
  },
  project_health: {
    title: "Project health",
    caption: "Buffer consumed against chain complete, per project, with last week's direction.",
  },
  what_moved: {
    title: "What moved",
    caption: "Items closed this week. A report that only shows problems stops being opened.",
  },
  team_pulse: {
    title: "Team pulse",
    caption: "Aggregate themes only, and only where at least 5 people responded.",
    orgScopeOnly: true,
  },
  data_quality: {
    title: "Data quality",
    caption: "What Loop does not know. A report that admits its gaps is believed on the rest.",
  },
};

/** Which vocabulary-driven labels each section renders. */
function sectionLabels(key: ReportSection, mode: CoordinationMode): Record<string, string> {
  switch (key) {
    case "flow":
      return {
        waiting: vocab(mode, "waiting"),
        blocked: vocab(mode, "blocked"),
        holder: vocab(mode, "owner"),
      };
    case "decision_queue":
    case "needs_decision":
      return {
        owner: vocab(mode, "owner"),
        escalate: vocab(mode, "escalate"),
        pastDate: vocab(mode, "past_date"),
      };
    case "process_conformance":
      return {
        waiting: vocab(mode, "waiting"),
        pastDate: vocab(mode, "past_date"),
        owner: vocab(mode, "owner"),
      };
    case "output_variance":
      return { owner: vocab(mode, "owner"), pastDate: vocab(mode, "past_date") };
    case "matter_commitments":
      return {
        owner: vocab(mode, "owner"),
        pastDate: vocab(mode, "past_date"),
        waiting: vocab(mode, "waiting"),
      };
    case "project_health":
      return { waiting: vocab(mode, "waiting") };
    case "data_quality":
      return { checkin: vocab(mode, "checkin") };
    default:
      return {};
  }
}

/** §10.4 scoping, applied before rendering rather than by hiding sections. */
export type ReportScope = "org" | "team" | "project";

const SCOPE_SECTIONS: Record<ReportScope, (key: ReportSection) => boolean> = {
  org: () => true,
  team: (key) => key !== "project_health",
  project: (key) => key === "needs_decision" || key === "project_health" || key === "what_moved",
};

export type ReportSectionOptions = {
  scope?: ReportScope;
  /** C-2: below the floor the whole section is omitted, with one line saying why. */
  surveyRespondents?: number;
};

/** C-2 floor, mirrored from `guards.ts` so this module stays self-describing. */
const MIN_SURVEY_RESPONDENTS = 5;

/**
 * The ordered sections for a tenant, with every user-facing string already in
 * the tenant's vocabulary. The emphasis section always leads (§3.3).
 */
export function reportSectionSpecs(
  mode: unknown,
  options: ReportSectionOptions = {},
): ReportSectionSpec[] {
  const profile = coordinationProfile(mode);
  const scope = options.scope ?? "org";
  const respondents = options.surveyRespondents ?? 0;

  return profile.report.sections
    .filter((key) => SCOPE_SECTIONS[scope](key))
    .filter((key) => key !== "team_pulse" || (scope === "org" && respondents >= MIN_SURVEY_RESPONDENTS))
    .map((key) => {
      const copy = SECTION_COPY[key];
      return {
        key,
        title: applyVocabulary(copy.title, profile.mode),
        caption: applyVocabulary(copy.caption, profile.mode),
        labels: sectionLabels(key, profile.mode),
        orgScopeOnly: copy.orgScopeOnly ?? false,
      };
    });
}

/** §10.2. Identical on every report, in every mode, and never substituted. */
export const REPORT_FOOTER =
  "This report describes the status of work items and projects. It is not a measure of individual " +
  "performance and must not be used as the basis for promotion, discipline, or termination decisions.";

// ─── §10.3 What may never appear ────────────────────────────────────────────

/**
 * Per-person rate keys. Distinct from `guards.ts`'s score keys: a "score" is
 * obviously forbidden and nobody writes one by accident, whereas a response
 * rate looks like a harmless operational figure right up until it is attached
 * to a name. 00_OVERHAUL_BRIEF §0.6 deletes both.
 */
const PERSONAL_RATE_KEYS = new Set([
  "responseRate",
  "response_rate",
  "completionRate",
  "completion_rate",
  "onTimeRate",
  "on_time_rate",
  "onTimePct",
  "on_time_pct",
  "punctuality",
  "reliability",
  "slaCompliance",
  "sla_compliance",
  "answeredOfSent",
  "answered_of_sent",
  "accuracyScore",
  "accuracy_score",
]);

const PERSON_KEYS = new Set([
  "userId",
  "user_id",
  "ownerUserId",
  "owner_user_id",
  "personId",
  "person_id",
  "memberId",
  "member_id",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkObjects(value: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visit);
    return;
  }
  if (!isPlainObject(value)) return;
  visit(value);
  for (const v of Object.values(value)) walkObjects(v, visit);
}

/**
 * §10.3, walked over the report JSON before it is rendered or stored. Naming a
 * **queue** is permitted and encouraged — "6 items waiting on the data team,
 * 41 team-days" is a map. Attaching a rate to a `user_id` is not.
 */
export function assertNoPersonalMetrics(reportJson: unknown): void {
  walkObjects(reportJson, (obj) => {
    const keys = Object.keys(obj);

    for (const key of keys) {
      if (PERSONAL_RATE_KEYS.has(key)) {
        throw new Error(
          `10_REPORTING §10.3: '${key}' is a per-person rate and may not appear in a report. ` +
            "Report the queue, not the person.",
        );
      }
    }

    const personKey = keys.find((k) => PERSON_KEYS.has(k));
    if (!personKey) return;

    // Any numeric metric sitting in the same object as a person identity is
    // keyed to that person, whatever it is called.
    const rateLike = keys.find(
      (k) => /rate$|pct$|percent|score|rank|average|median/i.test(k) && typeof obj[k] === "number",
    );
    if (rateLike) {
      throw new Error(
        `10_REPORTING §10.3: '${rateLike}' is keyed to '${personKey}'. No metric may be keyed to a user_id.`,
      );
    }
  });
}
