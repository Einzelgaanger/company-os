// generate-survey — nightly, per org, per scope.
//
// Builds the day's five questions for every project and department. The gap
// scorer in _shared/surveySignals.ts decides which topics to probe; the model
// only writes the wording for the topics it is handed. Everything it writes is
// screened before it can reach an employee.
//
// All questions are open text: the trendable number comes from theme mention
// rates and sentiment percentages in the weekly aggregate, not from asking
// people to rate things out of five.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders, audit } from "../_shared/supabase.ts";
import { claude, extractJson } from "../_shared/anthropic.ts";
import {
  TOPIC_BRIEF,
  isDuplicate,
  screenQuestion,
  screenQuestionsWithModel,
  type SurveyTopic,
} from "../_shared/surveyTaxonomy.ts";
import {
  QUESTIONS_PER_DAY,
  buildEvidence,
  resolveScopes,
  scoreTopicGaps,
  type ScopeEvidence,
  type SurveyScope,
  type TopicGap,
} from "../_shared/surveySignals.ts";

const MAX_GENERATION_ATTEMPTS = 3;

/** Used when generation fails or the screen rejects everything. */
const FALLBACK: Record<SurveyTopic, string> = {
  clarity: "What was least clear about your priorities this week?",
  blockers: "What slowed you down most recently, and is it still in the way?",
  resources: "What did you need this week that you did not have?",
  process: "Which step, handoff or approval took longer than it should have?",
  workload: "Was the amount of work you were given manageable? What would you change?",
  dependencies: "Who or what have you been waiting on longer than expected?",
  tooling: "Which tool or system got in your way, and how?",
  information: "What information did you need but struggle to find?",
};

const SYSTEM =
  "You write short, plain survey questions for a workplace coordination tool. " +
  "You write about working conditions only: clarity, blockers, resources, process, " +
  "workload volume, dependencies, tooling, and information. " +
  "You never ask about feelings, mood, stress, wellbeing, health, colleagues by name, " +
  "management performance, pay, or anything personal. Return JSON only.";

function prompt(scope: SurveyScope, evidence: ScopeEvidence, slots: TopicGap[]): string {
  return `Write one open-ended question for each slot below, for people working on "${scope.scopeLabel}".

Slots (write exactly one question per slot, in order):
${slots
  .map(
    (s, i) =>
      `${i + 1}. topic=${s.topic} — ${TOPIC_BRIEF[s.topic]}\n   why we are asking: ${s.reason}`,
  )
  .join("\n")}

What we already know about this group's week (context for phrasing, do not quote it back):
- ${evidence.commitmentsOpen} open items, ${evidence.commitmentsOverdue} overdue, ${evidence.commitmentsDone7d} completed in 7 days
- ${evidence.escalationsOpen} open escalations, ${evidence.commitmentsAtRisk} items at risk
- ${evidence.blockedReplies7d} of ${evidence.totalReplies7d} status replies reported a blocker
${evidence.priorThemes.length ? `- raised last week: ${evidence.priorThemes.map((t) => t.theme).join("; ")}` : "- no themes recorded last week"}

Rules:
- Every question is open text. Never ask for a rating, a score, or a number out of five.
- One sentence, under 160 characters, plain language, read on a phone.
- Ask about the work and the conditions around it, never about a person.
- Be specific to this group's situation rather than generic.
- Do not repeat these recent questions: ${evidence.recentQuestions.slice(0, 12).join(" | ") || "(none)"}

Return {"theme": string, "rationale": string, "questions": [{"text": string, "topic": string}]} with exactly ${slots.length} questions.`;
}

type Generated = { theme?: string; rationale?: string; questions?: Array<{ text?: string; topic?: string }> };

/** Screen, dedupe, and backfill from templates so a cycle always has five usable questions. */
async function buildQuestions(
  scope: SurveyScope,
  evidence: ScopeEvidence,
  slots: TopicGap[],
): Promise<{ theme: string; rationale: string; questions: Array<{ text: string; topic: SurveyTopic; reason: string; generatedBy: "ai" | "template" }> }> {
  let theme = `${scope.scopeLabel} — daily check`;
  let rationale = slots.map((s) => `${s.topic}: ${s.reason}`).join("; ");
  const accepted = new Map<SurveyTopic, { text: string; generatedBy: "ai" | "template" }>();

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const missing = slots.filter((s) => !accepted.has(s.topic));
    if (!missing.length) break;

    let generated: Generated;
    try {
      const out = await claude(SYSTEM, prompt(scope, evidence, missing), 1200);
      generated = extractJson<Generated>(out);
    } catch {
      break;
    }

    if (attempt === 0) {
      if (generated.theme) theme = String(generated.theme).slice(0, 80);
      if (generated.rationale) rationale = String(generated.rationale).slice(0, 300);
    }

    const candidates = (generated.questions ?? [])
      .map((q, i) => ({
        text: String(q?.text ?? "").trim(),
        topic: (missing[i]?.topic ?? q?.topic) as SurveyTopic,
      }))
      .filter((q) => q.text && missing.some((m) => m.topic === q.topic));

    // Deterministic screen first — it cannot be argued out of its judgement.
    const survivors = candidates.filter((q) => {
      if (!screenQuestion(q.text).ok) return false;
      if (isDuplicate(q.text, evidence.recentQuestions)) return false;
      if (isDuplicate(q.text, [...accepted.values()].map((a) => a.text))) return false;
      return true;
    });

    const flagged = await screenQuestionsWithModel(survivors.map((q) => q.text));
    const rejected = new Set(flagged.map((f) => f.index));

    survivors.forEach((q, i) => {
      if (rejected.has(i)) return;
      if (!accepted.has(q.topic)) accepted.set(q.topic, { text: q.text, generatedBy: "ai" });
    });
  }

  for (const slot of slots) {
    if (!accepted.has(slot.topic)) {
      accepted.set(slot.topic, { text: FALLBACK[slot.topic], generatedBy: "template" });
    }
  }

  return {
    theme,
    rationale,
    questions: slots.map((slot) => ({
      text: accepted.get(slot.topic)!.text,
      topic: slot.topic,
      reason: slot.reason,
      generatedBy: accepted.get(slot.topic)!.generatedBy,
    })),
  };
}

function weekBounds(date: string): { start: string; end: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * One salt per org per week, shared by every cycle in that week.
 *
 * The weekly report has to count distinct *people* across seven daily cycles to
 * apply the minimum-respondent rule. With a different salt per cycle the same
 * person hashes differently each day and five answers from one person would
 * look like five respondents. A weekly salt makes the hash stable for the week
 * and is no less private, because survey-weekly-report destroys it as soon as
 * the week is aggregated.
 */
async function weekSalt(db: any, orgId: string, surveyDate: string): Promise<string> {
  const { start, end } = weekBounds(surveyDate);
  const { data: existing } = await db
    .from("survey_cycles")
    .select("respondent_salt")
    .eq("org_id", orgId)
    .gte("survey_date", start)
    .lte("survey_date", end)
    .not("respondent_salt", "is", null)
    .limit(1)
    .maybeSingle();
  return existing?.respondent_salt ?? crypto.randomUUID() + crypto.randomUUID();
}

async function generateForScope(
  db: any,
  orgId: string,
  scope: SurveyScope,
  surveyDate: string,
  salt: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from("survey_cycles")
    .select("id")
    .eq("org_id", orgId)
    .eq("scope_type", scope.scopeType)
    .eq("scope_key", scope.scopeKey)
    .eq("survey_date", surveyDate)
    .maybeSingle();
  if (existing) return null;

  const evidence = await buildEvidence(db, orgId, scope);
  const slots = scoreTopicGaps(evidence).slice(0, QUESTIONS_PER_DAY);
  const built = await buildQuestions(scope, evidence, slots);

  const { data: cycle, error } = await db
    .from("survey_cycles")
    .insert({
      org_id: orgId,
      scope_type: scope.scopeType,
      scope_key: scope.scopeKey,
      scope_label: scope.scopeLabel,
      survey_date: surveyDate,
      theme: built.theme,
      generation_rationale: built.rationale,
      status: "pending_review",
      respondent_salt: salt,
      invited_count: scope.memberIds.length,
    })
    .select("id")
    .single();

  if (error || !cycle) return null;

  await db.from("survey_questions").insert(
    built.questions.map((q, i) => ({
      org_id: orgId,
      cycle_id: cycle.id,
      sort_order: i + 1,
      question_text: q.text,
      topic: q.topic,
      probe_reason: q.reason,
      generated_by: q.generatedBy,
    })),
  );

  await audit(db, orgId, "system", "survey.generated", "survey_cycle", cycle.id, {
    scope: `${scope.scopeType}:${scope.scopeKey}`,
    topics: built.questions.map((q) => q.topic),
    template_fallbacks: built.questions.filter((q) => q.generatedBy === "template").length,
  });

  return cycle.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const surveyDate = body.survey_date ?? new Date().toISOString().slice(0, 10);

  const { data: orgs } = body.org_id
    ? await db.from("organizations").select("id, name, settings").eq("id", body.org_id)
    : await db.from("organizations").select("id, name, settings");

  const created: string[] = [];
  for (const org of orgs ?? []) {
    if (org.settings?.surveys_enabled === false) continue;
    const scopes = await resolveScopes(db, org.id);
    const salt = await weekSalt(db, org.id, surveyDate);
    for (const scope of scopes) {
      try {
        const id = await generateForScope(db, org.id, scope, surveyDate, salt);
        if (id) created.push(id);
      } catch (_e) {
        // One bad scope must not stop the rest of the org.
      }
    }
  }

  return json({ generated: created.length, cycle_ids: created, survey_date: surveyDate });
});
