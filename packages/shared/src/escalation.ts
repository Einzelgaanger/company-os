/**
 * Kayode / SharePoint escalation scenario — Phase 4 exit shape (mock).
 * Pure routing: ownership map tag → assignee.
 */
export type OwnershipRule = {
  tag: string;
  assigneeUserId: string;
};

export function resolveEscalationOwner(
  tags: string[],
  rules: OwnershipRule[],
  fallbackUserId: string,
): { assigneeUserId: string; matchedTag: string | null } {
  for (const tag of tags) {
    const rule = rules.find((r) => r.tag.toLowerCase() === tag.toLowerCase());
    if (rule) return { assigneeUserId: rule.assigneeUserId, matchedTag: tag };
  }
  return { assigneeUserId: fallbackUserId, matchedTag: null };
}

export type EscalationContextSnapshot = {
  commitmentTitle: string;
  ownerName: string;
  dueDate: string | null;
  lastStatus: string;
  blockerNote: string | null;
  projectName: string | null;
};

/** Context must be actionable without a follow-up question. */
export function buildEscalationContext(
  input: EscalationContextSnapshot,
): string {
  const due = input.dueDate ?? "no due date";
  const blocker = input.blockerNote ?? "none given";
  const project = input.projectName ?? "unlinked";
  return [
    `Item: ${input.commitmentTitle}`,
    `Owner: ${input.ownerName}`,
    `Due: ${due}`,
    `Status: ${input.lastStatus}`,
    `Blocker: ${blocker}`,
    `Project: ${project}`,
  ].join("\n");
}
