/**
 * Calendar sync job — Phase 2 (Google / Microsoft incremental).
 * Stores metadata only; never descriptions/attachments in v1 (§4.4.2).
 */
import {
  isCalendarTitleExcluded,
  isLikelyStandup,
  type CalendarEventNorm,
} from "@loop/shared";

export type CalendarSyncResult = {
  fetched: number;
  excluded: number;
  stored: number;
  standupCandidates: string[];
};

export function processCalendarEvents(
  events: CalendarEventNorm[],
  extraTitlePatterns: string[] = []
): CalendarSyncResult {
  let excluded = 0;
  let stored = 0;
  const standupCandidates: string[] = [];

  for (const ev of events) {
    const ex = isCalendarTitleExcluded(ev.title, extraTitlePatterns);
    if (ex.excluded) {
      excluded += 1;
      continue;
    }
    stored += 1;
    if (isLikelyStandup(ev.title, !!ev.isRecurring)) {
      standupCandidates.push(ev.externalId);
    }
  }

  return { fetched: events.length, excluded, stored, standupCandidates };
}
