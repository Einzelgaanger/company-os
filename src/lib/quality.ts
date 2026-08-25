// Action-item quality helpers borrowed from DANI's validated patterns.

import type { Commitment, MeetingCategory } from "./types";

export const DEFAULT_REVIEW_THRESHOLD = 0.7;
export const DEFAULT_OUTBOUND_MAX_AGE_HOURS = 168; // 7 days

export const MEETING_CATEGORY_LABEL: Record<MeetingCategory, string> = {
  catch_up: "Catch-up",
  deal_origination: "Deal origination",
  project_execution: "Project execution",
  follow_up: "Follow-up",
  unknown: "Unknown",
};

/** Catch-ups never produce commitments. */
export function shouldExtractFromCategory(category: MeetingCategory | null | undefined): boolean {
  return category !== "catch_up";
}

export function needsReviewGate(
  confidence: number | null | undefined,
  threshold = DEFAULT_REVIEW_THRESHOLD,
  llmFlagged = false
): boolean {
  if (llmFlagged) return true;
  if (confidence == null) return true;
  return confidence < threshold;
}

export function isSnoozed(c: Commitment, today = new Date()): boolean {
  if (!c.snoozed_until) return false;
  return c.snoozed_until >= today.toISOString().slice(0, 10);
}

/** Skip outbound automation for stale source meetings (DANI Jul-2 blast lesson). */
export function isWithinRecencyWindow(
  occurredAt: string | null | undefined,
  maxAgeHours = DEFAULT_OUTBOUND_MAX_AGE_HOURS
): boolean {
  if (!occurredAt) return true; // manual / no meeting → allow
  const ageH = (Date.now() - new Date(occurredAt).getTime()) / 36e5;
  return ageH <= maxAgeHours;
}

export function parseSnoozeDate(text: string, now = new Date()): string | null {
  const t = text.toLowerCase();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  if (/\b(tomorrow)\b/.test(t)) {
    base.setDate(base.getDate() + 1);
    return base.toISOString().slice(0, 10);
  }
  if (/\b(next week)\b/.test(t)) {
    base.setDate(base.getDate() + 7);
    return base.toISOString().slice(0, 10);
  }
  if (/\b(friday)\b/.test(t)) {
    const day = base.getDay();
    const add = (5 - day + 7) % 7 || 7;
    base.setDate(base.getDate() + add);
    return base.toISOString().slice(0, 10);
  }
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const md = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (md) {
    const y = md[3] ? (md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3])) : base.getFullYear();
    const d = new Date(y, Number(md[1]) - 1, Number(md[2]));
    return d.toISOString().slice(0, 10);
  }
  // "snooze 3 days" / "push 2 days"
  const days = t.match(/\b(?:snooze|push|defer)\s*(?:for\s*)?(\d+)\s*days?\b/);
  if (days) {
    base.setDate(base.getDate() + Number(days[1]));
    return base.toISOString().slice(0, 10);
  }
  if (/\b(snooze|defer|push)\b/.test(t)) {
    base.setDate(base.getDate() + 3);
    return base.toISOString().slice(0, 10);
  }
  return null;
}

export interface DigestBucket {
  overdue: Commitment[];
  dueToday: Commitment[];
  upcoming: Commitment[];
  noDue: Commitment[];
}

export function buildDigestBuckets(items: Commitment[], today = new Date()): DigestBucket {
  const todayStr = today.toISOString().slice(0, 10);
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  const weekStr = week.toISOString().slice(0, 10);

  const active = items.filter((c) => c.status !== "done" && !isSnoozed(c, today));
  const overdue: Commitment[] = [];
  const dueToday: Commitment[] = [];
  const upcoming: Commitment[] = [];
  const noDue: Commitment[] = [];

  for (const c of active) {
    if (!c.due_date) {
      noDue.push(c);
      continue;
    }
    if (c.due_date < todayStr) overdue.push(c);
    else if (c.due_date === todayStr) dueToday.push(c);
    else if (c.due_date <= weekStr) upcoming.push(c);
  }
  return { overdue, dueToday, upcoming, noDue };
}

export function formatDigestMessage(ownerName: string, buckets: DigestBucket): string | null {
  const total =
    buckets.overdue.length + buckets.dueToday.length + buckets.upcoming.length + buckets.noDue.length;
  if (total === 0) return null;

  const lines: string[] = [`Good morning ${ownerName.split(" ")[0]} — your Loop digest:`];
  const section = (label: string, list: Commitment[]) => {
    if (!list.length) return;
    lines.push(`\n${label}`);
    list.slice(0, 8).forEach((c, i) => {
      const due = c.due_date ? ` (due ${c.due_date})` : "";
      lines.push(`${i + 1}. ${c.title}${due}`);
    });
    if (list.length > 8) lines.push(`…and ${list.length - 8} more`);
  };
  section("Overdue", buckets.overdue);
  section("Due today", buckets.dueToday);
  section("Upcoming (7d)", buckets.upcoming);
  section("No due date", buckets.noDue);
  lines.push("\nReply done / blocked / snooze Friday on any item.");
  return lines.join("\n");
}
