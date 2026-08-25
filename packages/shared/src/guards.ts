/** C-1 / C-2 hard product guardrails (00_START_HERE.md §0.2). */

export const HIGH_RISK_USE_PROHIBITED = true;

/** C-2: minimum respondents before any sentiment aggregate may be surfaced. */
export const MIN_SURVEY_N = 5;

const PERFORMANCE_SCORE_KEYS = new Set([
  "performanceScore",
  "performance_score",
  "productivityScore",
  "productivity_score",
  "individualScore",
  "individual_score",
  "personScore",
  "person_score",
  "ranking",
  "leagueTable",
  "league_table",
]);

const SENTIMENT_USER_KEYS = new Set([
  "userId",
  "user_id",
  "ownerUserId",
  "owner_user_id",
]);

function walk(value: unknown, visit: (key: string, val: unknown) => void): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      visit(k, v);
      walk(v, visit);
    }
  }
}

/**
 * C-1: never return per-person performance scores.
 * Throws if the payload contains forbidden score/ranking fields.
 */
export function assertNoPerformanceScore(payload: unknown): void {
  walk(payload, (key) => {
    if (PERFORMANCE_SCORE_KEYS.has(key)) {
      throw new Error(
        "C-1: per-person performance scores are prohibited. Loop coordinates work; it does not evaluate people.",
      );
    }
  });
}

/**
 * C-2: refuse sentiment keyed to userId.
 * Throws if a sentiment* field appears alongside a user identity key in the same object.
 */
export function assertNoIndividualSentiment(payload: unknown): void {
  const checkObject = (obj: Record<string, unknown>) => {
    const keys = Object.keys(obj);
    const hasSentiment = keys.some(
      (k) =>
        k === "sentiment" ||
        k === "sentimentLabel" ||
        k === "sentiment_label" ||
        k.startsWith("sentiment_"),
    );
    const hasUserKey = keys.some((k) => SENTIMENT_USER_KEYS.has(k));
    if (hasSentiment && hasUserKey) {
      throw new Error(
        "C-2: individual sentiment keyed to a user is prohibited. Aggregate only (min n = 5).",
      );
    }
  };

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    checkObject(payload as Record<string, unknown>);
  }

  walk(payload, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      checkObject(val as Record<string, unknown>);
    }
  });
}
