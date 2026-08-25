/**
 * Calendar ingestion helpers — Phase 2.
 * Exclusion patterns for titles (fail-safe defaults from §4.4.2).
 */

const DEFAULT_TITLE_EXCLUSIONS: RegExp[] = [
  /^1:1/i,
  /one[\s.-]?to[\s.-]?one/i,
  /performance review/i,
  /interview/i,
  /\bpersonal\b/i,
  /\bmedical\b/i,
];

export type CalendarEventNorm = {
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendeeEmails: string[];
  calendarId?: string;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
};

export function isCalendarTitleExcluded(
  title: string,
  extraPatterns: string[] = []
): { excluded: boolean; reason?: string } {
  for (const re of DEFAULT_TITLE_EXCLUSIONS) {
    if (re.test(title)) return { excluded: true, reason: re.source };
  }
  for (const p of extraPatterns) {
    try {
      if (new RegExp(p, "i").test(title)) return { excluded: true, reason: p };
    } catch {
      /* ignore bad pattern */
    }
  }
  return { excluded: false };
}

/** Detect recurring standup-like events for standup_prep messages */
export function isLikelyStandup(title: string, isRecurring: boolean): boolean {
  if (!isRecurring) return false;
  return /\b(standup|stand-up|daily sync|daily scrum|huddle)\b/i.test(title);
}

export type ConnectionHealth = {
  connectionId: string;
  provider: string;
  status: "connected" | "error" | "expired" | "disconnected";
  lastSyncedAt: string | null;
  hoursSinceSync: number | null;
  alert: boolean;
};

/** Alert when no successful sync in 6 hours (§4.7) */
export function connectionHealthFromSync(
  connectionId: string,
  provider: string,
  status: ConnectionHealth["status"],
  lastSyncedAt: string | null,
  now = Date.now()
): ConnectionHealth {
  let hoursSinceSync: number | null = null;
  if (lastSyncedAt) {
    hoursSinceSync = (now - new Date(lastSyncedAt).getTime()) / (1000 * 60 * 60);
  }
  const alert =
    status === "error" ||
    status === "expired" ||
    (status === "connected" && (hoursSinceSync == null || hoursSinceSync > 6));
  return { connectionId, provider, status, lastSyncedAt, hoursSinceSync, alert };
}
