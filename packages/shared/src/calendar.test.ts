import { describe, expect, it } from "vitest";
import {
  isCalendarTitleExcluded,
  isLikelyStandup,
  connectionHealthFromSync,
  linkProjectDeterministic,
  acceptModelProjectPick,
} from "./index.js";

describe("calendar helpers", () => {
  it("excludes 1:1 and performance review titles", () => {
    expect(isCalendarTitleExcluded("1:1 with Ada").excluded).toBe(true);
    expect(isCalendarTitleExcluded("Performance review").excluded).toBe(true);
    expect(isCalendarTitleExcluded("Sprint planning").excluded).toBe(false);
  });

  it("detects recurring standups", () => {
    expect(isLikelyStandup("Daily standup", true)).toBe(true);
    expect(isLikelyStandup("Daily standup", false)).toBe(false);
  });

  it("alerts when sync older than 6h", () => {
    const now = Date.parse("2026-08-24T12:00:00Z");
    const h = connectionHealthFromSync(
      "c1",
      "google_calendar",
      "connected",
      "2026-08-24T01:00:00Z",
      now,
    );
    expect(h.alert).toBe(true);
  });
});

describe("project link", () => {
  it("matches project code in title", () => {
    const r = linkProjectDeterministic(
      { title: "Kickoff PROJ-42", participantUserIds: [], externalParticipantDomains: [] },
      [
        {
          id: "p1",
          name: "Forty Two",
          code: "PROJ-42",
          clientName: null,
          teamMemberUserIds: [],
        },
      ],
    );
    expect(r).toMatchObject({ projectId: "p1", method: "code" });
  });

  it("rejects low-confidence model pick", () => {
    expect(acceptModelProjectPick("p1", 0.5)).toBeNull();
    expect(acceptModelProjectPick("p1", 0.8)?.method).toBe("model");
  });
});
