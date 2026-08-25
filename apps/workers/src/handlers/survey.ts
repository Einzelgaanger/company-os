import { aggregateSurveyThemes, type SurveyResponseRow } from "@loop/shared";

/** After aggregate succeeds, individual sentiment fields must be nullled (C-2). */
export function purgeIndividualSentiment<T extends Record<string, unknown>>(
  row: T,
): T {
  const next = { ...row };
  for (const k of Object.keys(next)) {
    if (k === "sentiment" || k.startsWith("sentiment_") || k === "sentimentLabel") {
      (next as Record<string, unknown>)[k] = null;
    }
  }
  return next;
}

export function processSurveyAggregate(responses: SurveyResponseRow[]) {
  const result = aggregateSurveyThemes(responses);
  if (!result.ok) return { ...result, purgedRows: [] as unknown[] };
  const purgedRows = responses.map((r) =>
    purgeIndividualSentiment({ ...r, sentiment: "x" } as Record<string, unknown>),
  );
  return { ...result, purgedRows };
}
