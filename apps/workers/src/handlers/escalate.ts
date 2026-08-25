import {
  buildEscalationContext,
  resolveEscalationOwner,
  type EscalationContextSnapshot,
  type OwnershipRule,
} from "@loop/shared";

export function processEscalation(input: {
  tags: string[];
  rules: OwnershipRule[];
  fallbackUserId: string;
  context: EscalationContextSnapshot;
}): { assigneeUserId: string; matchedTag: string | null; contextText: string } {
  const routed = resolveEscalationOwner(
    input.tags,
    input.rules,
    input.fallbackUserId,
  );
  return {
    ...routed,
    contextText: buildEscalationContext(input.context),
  };
}
