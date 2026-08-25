/** Model tiers from 05_AI_PIPELINE §5.2 */
export type ModelTier = "fast" | "standard" | "deep";

export type AiTask =
  | "classify_inbound_reply"
  | "extract_commitments"
  | "project_shortlist_match"
  | "opt_out_detection"
  | "survey_question_generation"
  | "theme_summarization"
  | "weekly_report_synthesis"
  | "ambiguous_rerun";

/** Every task has a default tier (05 §5.2 routing rules). */
export const TASK_DEFAULT_TIER: Record<AiTask, ModelTier> = {
  classify_inbound_reply: "fast",
  opt_out_detection: "fast",
  project_shortlist_match: "fast",
  extract_commitments: "standard",
  survey_question_generation: "deep",
  theme_summarization: "deep",
  weekly_report_synthesis: "deep",
  ambiguous_rerun: "deep",
};

export function defaultTierFor(task: AiTask): ModelTier {
  return TASK_DEFAULT_TIER[task];
}
