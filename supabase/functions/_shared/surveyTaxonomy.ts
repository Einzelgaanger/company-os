// Fixed survey topic taxonomy and the prohibited-topic screen.
//
// Spec 07_SURVEYS_SENTIMENT §7.3. The line this enforces is conditions, not
// feelings: "was your workload manageable" is in scope, "how are you feeling"
// is not. Emotion inference in the workplace is prohibited under EU AI Act
// Article 5(1)(f), so a generated question that strays there must never reach
// an employee.
//
// Two screens run in series: a deterministic one that cannot be talked out of
// its judgement, then a model pass for the phrasings a word list will miss.
// deno-lint-ignore-file no-explicit-any
import { claude, extractJson } from "./anthropic.ts";

export const SURVEY_TOPICS = [
  "clarity",
  "blockers",
  "resources",
  "process",
  "workload",
  "dependencies",
  "tooling",
  "information",
] as const;

export type SurveyTopic = (typeof SURVEY_TOPICS)[number];

export const TOPIC_BRIEF: Record<SurveyTopic, string> = {
  clarity: "how clear priorities, requirements and acceptance criteria were",
  blockers: "what slowed the work down, and what is still in the way",
  resources: "whether people had what they needed to do the work",
  process: "handoffs, approvals and steps that took longer than they should",
  workload: "whether the volume of work was manageable (workload, never stress or wellbeing)",
  dependencies: "waiting on other people, teams or external parties",
  tooling: "systems and tools that got in the way",
  information: "having the right information at the right time",
};

/**
 * Deterministic rejection list. Matches the excluded topics in §7.3: emotional
 * state, health, satisfaction with management, named colleagues, personal
 * circumstances, politics, union matters.
 */
const PROHIBITED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(how (are|do) you feel|feeling|felt)\b/i, reason: "asks about emotional state" },
  { pattern: /\b(mood|morale|happy|happiness|unhappy|sad|angry|frustrat\w*|anxious|anxiety)\b/i, reason: "asks about emotional state" },
  { pattern: /\b(stress\w*|burn ?out|burnt out|exhaust\w*|overwhelm\w*|wellbeing|well-being|mental health)\b/i, reason: "asks about stress or wellbeing" },
  { pattern: /\b(health|sick|illness|medical|therapy|medication)\b/i, reason: "asks about health" },
  { pattern: /\b(satisf\w* with (your |the )?(manager|management|boss|supervisor|leadership))\b/i, reason: "rates management" },
  { pattern: /\b(rate|score|rank|evaluate|assess) (your |the )?(colleague|coworker|co-worker|teammate|manager|boss)/i, reason: "evaluates a person" },
  { pattern: /\b(trust|respect|like|get along with) (your |the )?(colleague|coworker|teammate|manager|boss)/i, reason: "asks about a person" },
  { pattern: /\b(who (is|was) (the )?(worst|best|slowest|least|most)\b)/i, reason: "singles out a person" },
  { pattern: /\b(personal (life|circumstance|situation|problem)|family|home life|childcare|relationship)\b/i, reason: "asks about personal circumstances" },
  { pattern: /\b(politic\w*|religio\w*|union|strike|vote|voting|ethnic\w*|race|gender|sexual\w*|disab\w*|pregnan\w*)\b/i, reason: "touches a protected or prohibited subject" },
  { pattern: /\b(quit|resign|leave the (company|organisation|organization)|looking for another job|job search)\b/i, reason: "asks about intention to leave" },
  { pattern: /\b(salary|pay|compensation|bonus|raise|promotion)\b/i, reason: "asks about compensation or promotion" },
];

export type ScreenResult = { ok: true } | { ok: false; reason: string };

/** Fast, offline, and not subject to prompt injection. Runs on every question. */
export function screenQuestion(text: string): ScreenResult {
  const trimmed = text.trim();
  if (trimmed.length < 10) return { ok: false, reason: "too short to be a real question" };
  if (trimmed.length > 160) return { ok: false, reason: "too long to read on a phone" };

  for (const { pattern, reason } of PROHIBITED_PATTERNS) {
    if (pattern.test(trimmed)) return { ok: false, reason };
  }

  // Named individuals: a question that addresses someone by name is per-person
  // by construction, whatever it asks about.
  if (/\b(about|regarding|with) [A-Z][a-z]+ [A-Z][a-z]+\b/.test(trimmed)) {
    return { ok: false, reason: "names an individual" };
  }

  return { ok: true };
}

/**
 * Second pass for phrasings the word list misses. Fails open on transport
 * errors — the deterministic screen has already run, and blocking an entire
 * survey cycle because the model was unreachable is the worse failure.
 */
export async function screenQuestionsWithModel(
  questions: string[],
): Promise<Array<{ index: number; reason: string }>> {
  if (!questions.length) return [];
  try {
    const out = await claude(
      "You audit workplace survey questions for compliance. Return JSON only.",
      `These questions will be sent to employees. A question is ALLOWED only if it asks about working conditions: clarity, blockers, resources, process, workload volume, dependencies, tooling, or information availability.

A question is REJECTED if it asks about: emotions, mood, morale, stress, burnout, wellbeing, health, satisfaction with management, opinions about named colleagues, personal circumstances, politics, union matters, compensation, promotion, or intention to leave.

Return {"rejected": [{"index": <0-based>, "reason": "<short>"}]}. Return an empty array if all are allowed.

Questions:
${questions.map((q, i) => `${i}. ${q}`).join("\n")}`,
      600,
    );
    const parsed = extractJson<{ rejected?: Array<{ index: number; reason: string }> }>(out);
    return (parsed?.rejected ?? []).filter(
      (r) => Number.isInteger(r.index) && r.index >= 0 && r.index < questions.length,
    );
  } catch {
    return [];
  }
}

/** Near-duplicate check against recent cycles, so surveys do not go stale. */
export function isDuplicate(text: string, recent: string[]): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3);
  const a = new Set(norm(text));
  if (!a.size) return false;
  for (const prior of recent) {
    const b = norm(prior);
    if (!b.length) continue;
    const shared = b.filter((w) => a.has(w)).length;
    if (shared / Math.max(a.size, b.length) > 0.6) return true;
  }
  return false;
}
