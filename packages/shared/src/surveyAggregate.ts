/**
 * Survey aggregate gate — C-2 / Phase 5.
 * Never surface aggregates below MIN_SURVEY_N.
 */
import { MIN_SURVEY_N } from "./guards.js";

export type SurveyResponseRow = {
  /** Free-text theme tags only — never store per-user sentiment labels for display. */
  themeTags: string[];
};

export type AggregateResult =
  | {
      ok: true;
      n: number;
      themes: Array<{ tag: string; count: number }>;
    }
  | {
      ok: false;
      n: number;
      reason: "below_min_n";
      message: string;
    };

/**
 * Build theme counts. Suppresses output when n < MIN_SURVEY_N.
 * Does not accept or return userId-keyed sentiment.
 */
export function aggregateSurveyThemes(
  responses: SurveyResponseRow[],
  minN: number = MIN_SURVEY_N,
): AggregateResult {
  const n = responses.length;
  if (n < minN) {
    return {
      ok: false,
      n,
      reason: "below_min_n",
      message: `Not enough responses yet (${n}/${minN}). Individual answers stay private.`,
    };
  }

  const counts = new Map<string, number>();
  for (const r of responses) {
    for (const tag of r.themeTags) {
      const t = tag.trim().toLowerCase();
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const themes = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return { ok: true, n, themes };
}
