// survey-weekly-report — Monday morning, covering the previous Mon-Sun.
//
// Pools seven days of daily cycles into one aggregate per scope and one per
// line manager, then emails each manager the report for their own line. Pooling
// the week is what makes the minimum-respondent rule survivable: a single day
// in one department will rarely reach five people, a week usually will.
//
// The rule itself is absolute. A manager whose line produced fewer than five
// respondents gets the parent scope's aggregate instead, and is told why. There
// is no per-person output and no path that produces one.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders, audit } from "../_shared/supabase.ts";
import { claude, extractJson } from "../_shared/anthropic.ts";
import { sendTemplatedEmail, emailTemplates } from "../_shared/emailer.ts";
import { MIN_SURVEY_N, respondentHash } from "../_shared/surveySignals.ts";

type Answer = { hash: string; text: string; topic: string; question: string };

type Theme = { theme: string; mentionCount: number; exampleParaphrase?: string };

type Aggregate = {
  respondentCount: number;
  responseCount: number;
  themes: Theme[];
  sentiment: { positive: number; neutral: number; negative: number } | null;
  questionsAsked: Array<{ question: string; topic: string; answers: number }>;
};

function previousWeek(reference: Date): { start: string; end: string } {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  // Monday of the current week, then step back seven days.
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow - 7);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Everyone below this person in the reporting tree. */
function lineOf(managerId: string, managerIndex: Map<string, string[]>): string[] {
  const out: string[] = [];
  const queue = [...(managerIndex.get(managerId) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(managerIndex.get(id) ?? []));
  }
  return out;
}

async function summariseThemes(answers: Answer[]): Promise<Theme[]> {
  const texts = answers.map((a) => a.text).filter(Boolean);
  if (texts.length < 3) return [];
  try {
    const out = await claude(
      "You summarise anonymous workplace survey answers into recurring themes. Return JSON only.",
      `Group these answers into 2-4 recurring themes about working conditions.

For each theme give a short label, how many answers mention it, and a PARAPHRASED example. Never quote verbatim — a distinctive phrasing can identify who wrote it. Never name a person. Describe the working environment, not individuals.

Return {"themes": [{"theme": string, "mentionCount": number, "exampleParaphrase": string}]}.

Answers:
${texts.map((t) => `- ${t}`).join("\n")}`,
      1200,
    );
    const parsed = extractJson<{ themes?: Theme[] }>(out);
    return (parsed?.themes ?? []).slice(0, 4);
  } catch {
    return [];
  }
}

/**
 * Percentages only. Per-answer labels are written to survey_responses purely so
 * the purge below has something to clear, matching spec §7.6 step 5.
 */
async function summariseSentiment(
  answers: Answer[],
): Promise<{ positive: number; neutral: number; negative: number } | null> {
  const texts = answers.map((a) => a.text).filter(Boolean);
  if (texts.length < MIN_SURVEY_N) return null;
  try {
    const out = await claude(
      "You classify the tone of workplace feedback about working conditions. Return JSON only.",
      `Classify each answer as positive, neutral, or negative about the working conditions it describes.
Return {"labels": ["positive"|"neutral"|"negative", ...]} with exactly ${texts.length} entries in order.

${texts.map((t, i) => `${i}. ${t}`).join("\n")}`,
      800,
    );
    const parsed = extractJson<{ labels?: string[] }>(out);
    const labels = (parsed?.labels ?? []).slice(0, texts.length);
    if (labels.length < texts.length) return null;
    const count = (k: string) => labels.filter((l) => l === k).length;
    const total = labels.length;
    return {
      positive: Math.round((count("positive") / total) * 10000) / 100,
      neutral: Math.round((count("neutral") / total) * 10000) / 100,
      negative: Math.round((count("negative") / total) * 10000) / 100,
    };
  } catch {
    return null;
  }
}

async function aggregate(answers: Answer[]): Promise<Aggregate | null> {
  const respondents = new Set(answers.map((a) => a.hash));
  if (respondents.size < MIN_SURVEY_N) return null;

  const byQuestion = new Map<string, { topic: string; answers: number }>();
  for (const a of answers) {
    const entry = byQuestion.get(a.question) ?? { topic: a.topic, answers: 0 };
    entry.answers++;
    byQuestion.set(a.question, entry);
  }

  const [themes, sentiment] = await Promise.all([
    summariseThemes(answers),
    summariseSentiment(answers),
  ]);

  return {
    respondentCount: respondents.size,
    responseCount: answers.length,
    themes,
    sentiment,
    questionsAsked: [...byQuestion.entries()].map(([question, v]) => ({
      question,
      topic: v.topic,
      answers: v.answers,
    })),
  };
}

function renderMarkdown(input: {
  label: string;
  start: string;
  end: string;
  agg: Aggregate;
  invited: number;
  rolledUpFrom?: string;
}): string {
  const { agg } = input;
  const lines: string[] = [];

  lines.push(`## Team pulse — ${input.label}`);
  lines.push("");
  lines.push(`**${input.start} to ${input.end}**`);
  lines.push("");
  if (input.rolledUpFrom) {
    lines.push(
      `> Your own line produced fewer than ${MIN_SURVEY_N} respondents this week, so this shows ${input.label} instead. Reporting below that threshold would identify individuals.`,
    );
    lines.push("");
  }
  lines.push(
    `${agg.respondentCount} ${agg.respondentCount === 1 ? "person" : "people"} responded${
      input.invited ? ` of ${input.invited} asked` : ""
    }, giving ${agg.responseCount} answers.`,
  );
  lines.push("");

  lines.push("### Most raised this week");
  if (agg.themes.length) {
    for (const t of agg.themes) {
      lines.push(
        `- **${t.theme}** — raised by ${t.mentionCount} ${t.mentionCount === 1 ? "person" : "people"}.${
          t.exampleParaphrase ? ` ${t.exampleParaphrase}` : ""
        }`,
      );
    }
  } else {
    lines.push("- No recurring theme reached the reporting threshold this week.");
  }
  lines.push("");

  if (agg.sentiment) {
    lines.push("### Overall tone");
    lines.push(
      `${agg.sentiment.positive}% positive · ${agg.sentiment.neutral}% neutral · ${agg.sentiment.negative}% negative`,
    );
    lines.push("");
  }

  lines.push("### What we asked");
  for (const q of agg.questionsAsked) {
    lines.push(`- _${q.topic}_ — ${q.question} (${q.answers} answers)`);
  }
  lines.push("");
  lines.push(
    `_Individual answers are never shown to anyone. Only combined summaries across at least ${MIN_SURVEY_N} people are reported, and these themes describe working conditions, not people._`,
  );

  return lines.join("\n");
}

async function processOrg(db: any, org: any, start: string, end: string): Promise<number> {
  const { data: cycles } = await db
    .from("survey_cycles")
    .select("id, scope_type, scope_key, scope_label, invited_count, respondent_salt")
    .eq("org_id", org.id)
    .gte("survey_date", start)
    .lte("survey_date", end)
    .eq("status", "closed");

  if (!cycles?.length) return 0;

  const cycleIds = cycles.map((c: any) => c.id);
  const { data: responses } = await db
    .from("survey_responses")
    .select("id, cycle_id, question_id, respondent_hash, answer_text")
    .in("cycle_id", cycleIds);

  if (!responses?.length) return 0;

  const { data: questions } = await db
    .from("survey_questions")
    .select("id, question_text, topic")
    .in("cycle_id", cycleIds);
  const questionById = new Map((questions ?? []).map((q: any) => [q.id, q]));

  const answersByCycle = new Map<string, Answer[]>();
  for (const r of responses) {
    const q = questionById.get(r.question_id);
    const list = answersByCycle.get(r.cycle_id) ?? [];
    list.push({
      hash: r.respondent_hash,
      text: r.answer_text,
      topic: q?.topic ?? "unknown",
      question: q?.question_text ?? "",
    });
    answersByCycle.set(r.cycle_id, list);
  }

  const { data: users } = await db
    .from("users")
    .select("id, full_name, email, role, manager_id, email_prefs, email_unsubscribe_token")
    .eq("org_id", org.id);

  const managerIndex = new Map<string, string[]>();
  for (const u of users ?? []) {
    if (!u.manager_id) continue;
    const list = managerIndex.get(u.manager_id) ?? [];
    list.push(u.id);
    managerIndex.set(u.manager_id, list);
  }

  // --- Scope-level aggregates (project / department / org) -----------------
  const byScope = new Map<string, { label: string; type: string; key: string; answers: Answer[]; invited: number }>();
  for (const cycle of cycles) {
    const k = `${cycle.scope_type}:${cycle.scope_key}`;
    const entry = byScope.get(k) ?? {
      label: cycle.scope_label,
      type: cycle.scope_type,
      key: cycle.scope_key,
      answers: [],
      invited: 0,
    };
    entry.answers.push(...(answersByCycle.get(cycle.id) ?? []));
    entry.invited = Math.max(entry.invited, cycle.invited_count ?? 0);
    byScope.set(k, entry);
  }

  const orgAnswers: Answer[] = [];
  for (const entry of byScope.values()) orgAnswers.push(...entry.answers);

  const writeAggregate = async (
    scopeType: string,
    scopeKey: string,
    scopeLabel: string,
    agg: Aggregate,
    invited: number,
  ) => {
    await db.from("survey_aggregates").upsert(
      {
        org_id: org.id,
        scope_type: scopeType,
        scope_key: scopeKey,
        scope_label: scopeLabel,
        period_start: start,
        period_end: end,
        respondent_count: agg.respondentCount,
        response_count: agg.responseCount,
        invited_count: invited,
        themes: agg.themes,
        questions_asked: agg.questionsAsked,
        sentiment_positive_pct: agg.sentiment?.positive ?? null,
        sentiment_neutral_pct: agg.sentiment?.neutral ?? null,
        sentiment_negative_pct: agg.sentiment?.negative ?? null,
      },
      { onConflict: "org_id,scope_type,scope_key,period_start,period_end" },
    );
  };

  for (const entry of byScope.values()) {
    const agg = await aggregate(entry.answers);
    if (agg) await writeAggregate(entry.type, entry.key, entry.label, agg, entry.invited);
  }

  const orgAgg = await aggregate(orgAnswers);
  if (orgAgg) await writeAggregate("org", "org", org.name, orgAgg, (users ?? []).length);

  // --- Per-manager aggregates ----------------------------------------------
  // Hashes are still recomputable this week, which is what lets us slice a
  // manager's line. After the purge below it becomes impossible by design.
  const managers = (users ?? []).filter(
    (u: any) => ["manager", "admin", "owner"].includes(u.role) && managerIndex.has(u.id),
  );

  let reportsWritten = 0;

  for (const manager of managers) {
    const line = lineOf(manager.id, managerIndex);
    if (!line.length) continue;

    const lineAnswers: Answer[] = [];
    for (const cycle of cycles) {
      if (!cycle.respondent_salt) continue;
      const cycleAnswers = answersByCycle.get(cycle.id);
      if (!cycleAnswers?.length) continue;
      const hashes = new Set(
        await Promise.all(line.map((uid) => respondentHash(uid, cycle.respondent_salt))),
      );
      lineAnswers.push(...cycleAnswers.filter((a) => hashes.has(a.hash)));
    }

    let agg = await aggregate(lineAnswers);
    let label = `${manager.full_name}'s team`;
    let rolledUpFrom: string | undefined;
    let invited = line.length;

    if (agg) {
      await writeAggregate("manager_line", manager.id, label, agg, invited);
    } else if (orgAgg) {
      // Too few respondents in this line — fall back to the org view and say so.
      agg = orgAgg;
      rolledUpFrom = label;
      label = org.name;
      invited = (users ?? []).length;
    } else {
      continue;
    }

    const contentMd = renderMarkdown({ label, start, end, agg, invited, rolledUpFrom });

    const { data: report } = await db
      .from("reports")
      .insert({
        org_id: org.id,
        type: "survey_weekly",
        period_start: start,
        period_end: end,
        content_md: contentMd,
        content_json: {
          scope: rolledUpFrom ? "org" : "manager_line",
          manager_id: manager.id,
          respondent_count: agg.respondentCount,
          response_count: agg.responseCount,
          themes: agg.themes,
          sentiment: agg.sentiment,
          rolled_up_from: rolledUpFrom ?? null,
        },
        recipient_ids: [manager.id],
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!report) continue;
    reportsWritten++;

    const mail = emailTemplates.survey_weekly_report({
      recipient: manager,
      scopeLabel: label,
      periodLabel: `${start} to ${end}`,
      bodyMarkdown: contentMd,
      reportId: report.id,
    });
    await sendTemplatedEmail(db, {
      orgId: org.id,
      to: manager,
      category: "report",
      template: "survey_weekly_report",
      subject: mail.subject,
      html: mail.html,
      relatedType: "report",
      relatedId: report.id,
      idempotencyKey: `survey_weekly:${manager.id}:${start}`,
    });

    await db.from("notifications").insert({
      org_id: org.id,
      user_id: manager.id,
      kind: "report",
      title: "Weekly team pulse is ready",
      body: `${agg.respondentCount} people responded across ${start} to ${end}.`,
      link: `/reports/${report.id}`,
    });
  }

  // --- Purge (spec §7.6 steps 5 and 6) -------------------------------------
  // Clear the per-answer sentiment inference and destroy the salts, which makes
  // every response in this period permanently unattributable.
  await db
    .from("survey_responses")
    .update({ sentiment_label: null, sentiment_purged_at: new Date().toISOString() })
    .in("cycle_id", cycleIds);

  await db.from("survey_cycles").update({ respondent_salt: null }).in("id", cycleIds);

  await audit(db, org.id, "system", "survey.week_aggregated", null, null, {
    period_start: start,
    period_end: end,
    cycles: cycleIds.length,
    reports: reportsWritten,
    salts_destroyed: cycleIds.length,
  });

  return reportsWritten;
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

  const { start, end } =
    body.period_start && body.period_end
      ? { start: body.period_start, end: body.period_end }
      : previousWeek(new Date());

  const { data: orgs } = body.org_id
    ? await db.from("organizations").select("id, name, settings").eq("id", body.org_id)
    : await db.from("organizations").select("id, name, settings");

  let reports = 0;
  for (const org of orgs ?? []) {
    try {
      reports += await processOrg(db, org, start, end);
    } catch (_e) {
      // One org's failure must not block the rest of the run.
    }
  }

  return json({ reports, period_start: start, period_end: end });
});
