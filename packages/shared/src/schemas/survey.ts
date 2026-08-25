import { z } from "zod";
import { MIN_SURVEY_N } from "../guards.js";

/**
 * Aggregated survey output only (C-2).
 * respondentCount must be >= MIN_SURVEY_N (5); enforced here and in DB CHECK.
 */
export const surveyAggregateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  cycleId: z.string().uuid(),
  scope: z.enum(["org", "team", "project"]).default("org"),
  scopeId: z.string().uuid().nullable().optional(),
  /** C-2: min_n — never surface aggregates below this threshold. */
  respondentCount: z.number().int().min(MIN_SURVEY_N),
  avgScale: z.number().nullable().optional(),
  sentimentPositivePct: z.number().min(0).max(100).nullable().optional(),
  sentimentNeutralPct: z.number().min(0).max(100).nullable().optional(),
  sentimentNegativePct: z.number().min(0).max(100).nullable().optional(),
  themes: z
    .array(
      z.object({
        theme: z.string(),
        mentionCount: z.number().int().nonnegative(),
        exampleParaphrase: z.string().optional(),
      }),
    )
    .default([]),
  createdAt: z.coerce.date(),
});

export type SurveyAggregate = z.infer<typeof surveyAggregateSchema>;

/** Re-export for schema consumers that need the constant beside the type. */
export { MIN_SURVEY_N };
