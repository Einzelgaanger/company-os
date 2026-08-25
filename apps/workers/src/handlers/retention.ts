/** Retention purge stub — Phase 6. Computes cutoffs; DB delete at cutover. */

export type RetentionPolicy = {
  messagesMonths: number;
  transcriptsMonths: number;
};

export function retentionCutoffs(
  policy: RetentionPolicy,
  now = new Date(),
): { messagesBefore: string; transcriptsBefore: string } {
  const msg = new Date(now);
  msg.setMonth(msg.getMonth() - policy.messagesMonths);
  const tx = new Date(now);
  tx.setMonth(tx.getMonth() - policy.transcriptsMonths);
  return {
    messagesBefore: msg.toISOString(),
    transcriptsBefore: tx.toISOString(),
  };
}

export function processRetentionPurge(policy: RetentionPolicy) {
  const cutoffs = retentionCutoffs(policy);
  return {
    status: "computed" as const,
    cutoffs,
    note: "Would DELETE WHERE created_at < cutoff under tenant RLS",
  };
}
