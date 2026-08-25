/** Reply classification — offline heuristic (Phase 3 gate ≥0.90 measured later). */

export type ClassifyResult = {
  status: "on_track" | "blocked" | "done" | "unclear" | "snoozed";
  confidence: number;
};

export function classifyReply(text: string): ClassifyResult {
  const t = text.trim().toLowerCase();
  if (!t) return { status: "unclear", confidence: 0.2 };
  if (/\b(done|finished|completed|shipped)\b/.test(t)) {
    return { status: "done", confidence: 0.92 };
  }
  if (/\b(blocked|stuck|waiting|can't|cannot)\b/.test(t)) {
    return { status: "blocked", confidence: 0.9 };
  }
  if (/\b(snooze|later|friday|next week)\b/.test(t)) {
    return { status: "snoozed", confidence: 0.85 };
  }
  if (/\b(on track|good|fine|progressing|ok)\b/.test(t)) {
    return { status: "on_track", confidence: 0.88 };
  }
  return { status: "unclear", confidence: 0.4 };
}
