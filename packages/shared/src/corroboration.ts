/**
 * B8 corroboration — 04_FLOW_ENGINE.md §4.10.
 *
 * Self-reported state is the primary signal; objective signals corroborate it.
 * Divergence flags **the item** — `commitments.needs_look` plus a reason — and
 * surfaces in `/review` under "Might be stale". It never flags the person, is
 * never counted per person, and is never an escalation trigger on its own.
 * Recording it per person is precisely the attributional measurement that makes
 * people manage the metric instead of the work.
 *
 * Deliberately connector-free. The Drive/OneDrive and email-metadata
 * connectors are separate work; this module takes whatever signals a caller
 * already has and says whether they agree with the claim. With no signals it
 * returns `unobserved`, not `diverged` — absence of evidence from a connector
 * nobody has built yet is not evidence of a wrong claim.
 */

import { type FlowState } from "./flow.js";

/** §4.10's objective signal table, one kind per row. */
export type CorroborationSource =
  | "artifact"
  | "calendar"
  | "dependency"
  | "external_reply"
  | "internal_activity";

export type CorroborationSignal = {
  source: CorroborationSource;
  /** True when the signal was actually observed, false when the source was checked and found nothing. */
  observed: boolean;
  /** ISO timestamp of the observation. */
  at: string;
  /** What was seen, for the `/review` card. Never a person's name. */
  detail: string;
};

/** Which sources can speak to which claim (§4.10). Anything else is irrelevant noise. */
const SOURCES_FOR_CLAIM: Partial<Record<FlowState, readonly CorroborationSource[]>> = {
  review: ["artifact"],
  done: ["artifact"],
  waiting_decision: ["calendar"],
  waiting_dependency: ["dependency"],
  waiting_external: ["external_reply"],
  active: ["artifact", "internal_activity"],
};

/** §4.10 — no flow event in 10+ working days on an `active` item is staleness. */
export const STALE_ACTIVE_WORKING_DAYS = 10;

export type CorroborationInput = {
  commitmentId: string;
  /** The state the owner reported. Loop derives it; the person never picks a label. */
  claimedState: FlowState;
  /** Working days since the last `flow_events` row on this item. */
  workingDaysSinceLastEvent: number;
  signals: readonly CorroborationSignal[];
};

export type AgreementLevel = "none" | "single" | "multiple";

export type CorroborationVerdict = {
  commitmentId: string;
  /**
   * `corroborated` — at least one relevant source agrees.
   * `unobserved`   — nothing relevant was checked, or nothing was found and
   *                  nothing is stale. The honest default.
   * `diverged`     — the claim and the evidence disagree, or the item has gone
   *                  quiet long enough to be worth a human look.
   */
  agreement: "corroborated" | "unobserved" | "diverged";
  level: AgreementLevel;
  agreeingSources: CorroborationSource[];
  /** Written to `commitments.needs_look`. */
  needsLook: boolean;
  /** Written to `commitments.needs_look_reason`. */
  needsLookReason: string | null;
  /** The `/review` card's copy. Neutral by construction — it asks, it does not accuse. */
  prompt: string | null;
};

export function corroborate(input: CorroborationInput): CorroborationVerdict {
  const relevant = SOURCES_FOR_CLAIM[input.claimedState] ?? [];
  const agreeingSources = input.signals
    .filter((s) => s.observed && relevant.includes(s.source))
    .map((s) => s.source);
  const unique = [...new Set(agreeingSources)];

  const level: AgreementLevel =
    unique.length === 0 ? "none" : unique.length === 1 ? "single" : "multiple";

  if (unique.length > 0) {
    return {
      commitmentId: input.commitmentId,
      agreement: "corroborated",
      level,
      agreeingSources: unique,
      needsLook: false,
      needsLookReason: null,
      prompt: null,
    };
  }

  const staleActive =
    input.claimedState === "active" &&
    input.workingDaysSinceLastEvent >= STALE_ACTIVE_WORKING_DAYS;

  if (staleActive) {
    return {
      commitmentId: input.commitmentId,
      agreement: "diverged",
      level,
      agreeingSources: [],
      needsLook: true,
      needsLookReason: `Active for ${input.workingDaysSinceLastEvent} working days with no updates.`,
      prompt: `This has been active for ${input.workingDaysSinceLastEvent} days with no updates. Still moving?`,
    };
  }

  // A source that was checked and found nothing, against a claim it can speak
  // to. Weaker than staleness, so it only counts where the claim asserts an
  // artifact should exist.
  const checkedAndEmpty = input.signals.some(
    (s) => !s.observed && relevant.includes(s.source),
  );
  const assertsArtifact = input.claimedState === "done" || input.claimedState === "review";

  if (checkedAndEmpty && assertsArtifact) {
    return {
      commitmentId: input.commitmentId,
      agreement: "diverged",
      level,
      agreeingSources: [],
      needsLook: true,
      needsLookReason: "Reported finished, but nothing matching it has appeared in shared storage.",
      prompt: "This is marked finished. Is there anything the requester still needs to see?",
    };
  }

  return {
    commitmentId: input.commitmentId,
    agreement: "unobserved",
    level,
    agreeingSources: [],
    needsLook: false,
    needsLookReason: null,
    prompt: null,
  };
}

export type CorroborationRollup = {
  itemsChecked: number;
  corroborated: number;
  unobserved: number;
  diverged: number;
  /** Item ids only. There is no per-person breakdown, and there is not going to be one. */
  needsLookItemIds: string[];
};

/**
 * The only aggregate this module produces. Keyed to items, never to people —
 * §4.10 forbids computing a per-person accuracy score, showing divergence
 * counts by person, or using divergence as an escalation trigger.
 */
export function rollupCorroboration(
  verdicts: readonly CorroborationVerdict[],
): CorroborationRollup {
  const rollup: CorroborationRollup = {
    itemsChecked: verdicts.length,
    corroborated: 0,
    unobserved: 0,
    diverged: 0,
    needsLookItemIds: [],
  };
  for (const v of verdicts) {
    if (v.agreement === "corroborated") rollup.corroborated += 1;
    else if (v.agreement === "diverged") rollup.diverged += 1;
    else rollup.unobserved += 1;
    if (v.needsLook) rollup.needsLookItemIds.push(v.commitmentId);
  }
  return rollup;
}
