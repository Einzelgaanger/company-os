// Survey scope resolution, evidence gathering, and topic gap scoring.
//
// This is the part that makes a daily survey worth answering. Rather than
// rotating a fixed question set, we look at what the organisation's own data
// already tells us, work out where the data is thin or contradictory, and ask
// about that.
//
// Division of labour, per spec §7.2: the gap scorer here decides WHICH topics
// to probe and why. The model only writes the wording. An unconstrained model
// choosing what to ask employees is the failure mode this avoids.
// deno-lint-ignore-file no-explicit-any
import { SURVEY_TOPICS, type SurveyTopic } from "./surveyTaxonomy.ts";

/**
 * Minimum distinct respondents before any survey result may be reported.
 * Mirrors MIN_SURVEY_N in @loop/shared and the CHECK on survey_aggregates.
 */
export const MIN_SURVEY_N = 5;

/** Questions asked per scope per day. */
export const QUESTIONS_PER_DAY = 5;

/**
 * Must produce the same value as the survey_respondent_hash() SQL function:
 * HMAC-SHA256 of the user id, keyed by the cycle salt, hex encoded. The weekly
 * aggregator uses this to count distinct people across a week of daily cycles
 * without ever storing a user id beside an answer.
 */
export async function respondentHash(userId: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SurveyScope = {
  scopeType: "project" | "department" | "org";
  scopeKey: string;
  scopeLabel: string;
  memberIds: string[];
};

/**
 * Everyone active lands in exactly one scope: their project if they are on one,
 * else their department, else the org. People on several projects go to the one
 * where they hold the most open work, so questions match what they are doing.
 */
export async function resolveScopes(db: any, orgId: string): Promise<SurveyScope[]> {
  const { data: users } = await db
    .from("users")
    .select("id, department")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (!users?.length) return [];

  const { data: memberships } = await db
    .from("project_members")
    .select("project_id, user_id, projects!inner(id, name, status)")
    .eq("org_id", orgId);

  const { data: openWork } = await db
    .from("commitments")
    .select("owner_id, project_id")
    .eq("org_id", orgId)
    .not("project_id", "is", null)
    .not("status", "eq", "done");

  const workload = new Map<string, number>();
  for (const c of openWork ?? []) {
    if (!c.owner_id) continue;
    const key = `${c.owner_id}:${c.project_id}`;
    workload.set(key, (workload.get(key) ?? 0) + 1);
  }

  const projectsByUser = new Map<string, Array<{ id: string; name: string }>>();
  for (const m of memberships ?? []) {
    const project = (m as any).projects;
    if (!project || project.status !== "active") continue;
    const list = projectsByUser.get(m.user_id) ?? [];
    list.push({ id: project.id, name: project.name });
    projectsByUser.set(m.user_id, list);
  }

  const scopes = new Map<string, SurveyScope>();
  const push = (scope: Omit<SurveyScope, "memberIds">, userId: string) => {
    const key = `${scope.scopeType}:${scope.scopeKey}`;
    const existing = scopes.get(key);
    if (existing) existing.memberIds.push(userId);
    else scopes.set(key, { ...scope, memberIds: [userId] });
  };

  for (const u of users) {
    const projects = projectsByUser.get(u.id) ?? [];
    if (projects.length) {
      const primary = projects
        .map((p) => ({ p, load: workload.get(`${u.id}:${p.id}`) ?? 0 }))
        .sort((a, b) => b.load - a.load || a.p.name.localeCompare(b.p.name))[0].p;
      push(
        { scopeType: "project", scopeKey: primary.id, scopeLabel: primary.name },
        u.id,
      );
    } else if (u.department?.trim()) {
      push(
        { scopeType: "department", scopeKey: u.department.trim(), scopeLabel: u.department.trim() },
        u.id,
      );
    } else {
      push({ scopeType: "org", scopeKey: "org", scopeLabel: "Everyone" }, u.id);
    }
  }

  return [...scopes.values()];
}

export type ScopeEvidence = {
  memberCount: number;
  commitmentsOpen: number;
  commitmentsOverdue: number;
  commitmentsDone7d: number;
  commitmentsAtRisk: number;
  escalationsOpen: number;
  escalationCategories: Array<{ category: string; count: number }>;
  blockedReplies7d: number;
  unclearReplies7d: number;
  totalReplies7d: number;
  blockerPhrases: string[];
  /** Themes from the last aggregated week, so a survey can follow up on them. */
  priorThemes: Array<{ theme: string; mentionCount: number }>;
  /** topic -> days since we last asked it in this scope. */
  daysSinceAsked: Record<string, number | null>;
  recentQuestions: string[];
};

const DAY = 86_400_000;

export async function buildEvidence(
  db: any,
  orgId: string,
  scope: SurveyScope,
): Promise<ScopeEvidence> {
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  let commitmentQuery = db
    .from("commitments")
    .select("status, due_date, updated_at, title")
    .eq("org_id", orgId);
  commitmentQuery =
    scope.scopeType === "project"
      ? commitmentQuery.eq("project_id", scope.scopeKey)
      : commitmentQuery.in("owner_id", scope.memberIds);
  const { data: commitments } = await commitmentQuery;

  const rows = commitments ?? [];
  const open = rows.filter((c: any) => c.status !== "done");

  const { data: escalations } = await db
    .from("escalations")
    .select("id, reason, status, commitment_id")
    .eq("org_id", orgId)
    .neq("status", "resolved");

  const { data: replies } = await db
    .from("checkins")
    .select("parsed_status, parsed_blocker")
    .eq("org_id", orgId)
    .eq("direction", "inbound")
    .in("user_id", scope.memberIds)
    .gte("created_at", since7);

  const replyRows = replies ?? [];

  const { data: priorAggregate } = await db
    .from("survey_aggregates")
    .select("themes")
    .eq("org_id", orgId)
    .eq("scope_type", scope.scopeType)
    .eq("scope_key", scope.scopeKey)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Topic recency across this scope's last 30 days of questions.
  const { data: askedRows } = await db
    .from("survey_questions")
    .select("topic, question_text, survey_cycles!inner(survey_date, scope_type, scope_key)")
    .eq("org_id", orgId)
    .eq("survey_cycles.scope_type", scope.scopeType)
    .eq("survey_cycles.scope_key", scope.scopeKey)
    .gte("survey_cycles.survey_date", new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10));

  const daysSinceAsked: Record<string, number | null> = {};
  for (const t of SURVEY_TOPICS) daysSinceAsked[t] = null;
  const recentQuestions: string[] = [];
  for (const row of askedRows ?? []) {
    const date = (row as any).survey_cycles?.survey_date;
    recentQuestions.push(row.question_text);
    if (!date) continue;
    const days = Math.floor((Date.parse(today) - Date.parse(date)) / DAY);
    const current = daysSinceAsked[row.topic];
    if (current === null || days < current) daysSinceAsked[row.topic] = days;
  }

  const categoryCounts = new Map<string, number>();
  for (const e of escalations ?? []) {
    const word = String(e.reason ?? "").split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (word) categoryCounts.set(word, (categoryCounts.get(word) ?? 0) + 1);
  }

  return {
    memberCount: scope.memberIds.length,
    commitmentsOpen: open.length,
    commitmentsOverdue: open.filter((c: any) => c.due_date && c.due_date < today).length,
    commitmentsDone7d: rows.filter((c: any) => c.status === "done" && c.updated_at >= since7).length,
    commitmentsAtRisk: open.filter((c: any) => c.status === "at_risk" || c.status === "escalated").length,
    escalationsOpen: (escalations ?? []).length,
    escalationCategories: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    blockedReplies7d: replyRows.filter((r: any) => r.parsed_status === "blocked").length,
    unclearReplies7d: replyRows.filter((r: any) => r.parsed_status === "unclear").length,
    totalReplies7d: replyRows.length,
    blockerPhrases: replyRows
      .map((r: any) => r.parsed_blocker)
      .filter(Boolean)
      .slice(0, 20),
    priorThemes: (priorAggregate?.themes ?? []) as Array<{ theme: string; mentionCount: number }>,
    daysSinceAsked,
    recentQuestions,
  };
}

export type TopicGap = {
  topic: SurveyTopic;
  score: number;
  /** Plain-language explanation, stored on the question and shown to admins. */
  reason: string;
};

/**
 * Rank topics by how much asking would tell us that we do not already know.
 *
 * Four pressures, deliberately in this order of weight:
 *  - evidence of a problem we cannot explain from structured data alone
 *  - an unresolved theme carried over from last week
 *  - staleness, so every topic gets asked eventually
 *  - a small penalty for topics asked very recently, to keep the set varied
 */
export function scoreTopicGaps(evidence: ScopeEvidence): TopicGap[] {
  const gaps: TopicGap[] = [];
  const reasons: Record<SurveyTopic, string[]> = {
    clarity: [],
    blockers: [],
    resources: [],
    process: [],
    workload: [],
    dependencies: [],
    tooling: [],
    information: [],
  };
  const scores: Record<SurveyTopic, number> = {
    clarity: 0,
    blockers: 0,
    resources: 0,
    process: 0,
    workload: 0,
    dependencies: 0,
    tooling: 0,
    information: 0,
  };

  const add = (topic: SurveyTopic, points: number, reason: string) => {
    scores[topic] += points;
    if (reason) reasons[topic].push(reason);
  };

  // Unexplained delivery problems. We can see work is late; only people can
  // tell us why, and the plausible causes map to different topics.
  const overdueRate = evidence.commitmentsOpen
    ? evidence.commitmentsOverdue / evidence.commitmentsOpen
    : 0;
  if (overdueRate > 0.25) {
    const note = `${Math.round(overdueRate * 100)}% of open work is overdue and the cause is not in the data`;
    add("blockers", 30, note);
    add("dependencies", 20, note);
    add("workload", 18, note);
  }

  if (evidence.commitmentsAtRisk >= 3) {
    add("process", 16, `${evidence.commitmentsAtRisk} items flagged at risk`);
    add("resources", 12, `${evidence.commitmentsAtRisk} items flagged at risk`);
  }

  if (evidence.escalationsOpen >= 2) {
    const note = `${evidence.escalationsOpen} open escalations in this scope`;
    add("dependencies", 18, note);
    add("process", 16, note);
  }

  // People reply "blocked" but the blocker text is thin or repetitive: we know
  // something is wrong and not what.
  if (evidence.blockedReplies7d >= 2) {
    add("blockers", 25, `${evidence.blockedReplies7d} blocked replies this week`);
  }
  if (evidence.blockerPhrases.length < evidence.blockedReplies7d) {
    add("blockers", 10, "blocked replies arrived without a stated cause");
  }

  // A high unclear rate usually means people do not know what is being asked
  // of them, not that they are bad at replying.
  const unclearRate = evidence.totalReplies7d
    ? evidence.unclearReplies7d / evidence.totalReplies7d
    : 0;
  if (unclearRate > 0.2) {
    add("clarity", 26, `${Math.round(unclearRate * 100)}% of replies were ambiguous`);
    add("information", 16, `${Math.round(unclearRate * 100)}% of replies were ambiguous`);
  }

  // Silence is its own signal: no replies at all means we are flying blind.
  if (evidence.memberCount >= 3 && evidence.totalReplies7d === 0) {
    add("blockers", 14, "no status replies at all this week");
    add("workload", 14, "no status replies at all this week");
  }

  // Follow up on what was raised last week rather than starting fresh.
  for (const theme of evidence.priorThemes.slice(0, 3)) {
    const topic = topicForTheme(theme.theme);
    if (topic) {
      add(topic, 22, `"${theme.theme}" was raised by ${theme.mentionCount} people last week`);
    }
  }

  // Staleness, so coverage does not collapse onto whichever topic is loudest.
  for (const topic of SURVEY_TOPICS) {
    const days = evidence.daysSinceAsked[topic];
    if (days === null) {
      add(topic, 14, "not asked in the last 30 days");
    } else if (days >= 7) {
      add(topic, Math.min(12, days), `last asked ${days} days ago`);
    } else if (days <= 1) {
      add(topic, -18, "");
    } else {
      add(topic, -6, "");
    }
  }

  for (const topic of SURVEY_TOPICS) {
    gaps.push({
      topic,
      score: scores[topic],
      reason: reasons[topic][0] ?? "routine coverage",
    });
  }

  return gaps.sort((a, b) => b.score - a.score);
}

function topicForTheme(theme: string): SurveyTopic | null {
  const t = theme.toLowerCase();
  if (/clar|requirement|acceptance|brief|spec/.test(t)) return "clarity";
  if (/wait|depend|extern|third.?party|client response/.test(t)) return "dependencies";
  if (/tool|system|access|login|software|licen/.test(t)) return "tooling";
  if (/approv|handoff|hand-off|process|sign.?off|review cycle/.test(t)) return "process";
  if (/capacity|workload|volume|bandwidth|too much|stretched/.test(t)) return "workload";
  if (/budget|staff|resource|equipment|headcount/.test(t)) return "resources";
  if (/information|context|data|docs|documentation/.test(t)) return "information";
  if (/block/.test(t)) return "blockers";
  return null;
}
