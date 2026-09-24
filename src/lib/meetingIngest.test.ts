import { describe, expect, it } from "vitest";
import { draftCommitmentsFromCall, isHeldMeeting } from "./meetingIngest";

describe("isHeldMeeting", () => {
  it("treats missing privacy_held as already stored", () => {
    expect(isHeldMeeting({})).toBe(false);
    expect(isHeldMeeting({ privacy_held: false })).toBe(false);
    expect(isHeldMeeting({ privacy_held: true })).toBe(true);
  });
});

describe("draftCommitmentsFromCall", () => {
  it("pulls follow-ups from a whole-call transcript", () => {
    const drafts = draftCommitmentsFromCall(
      "Grace: We need to close the Q3 payroll review by Friday. Brian will send the leave policy draft to legal.",
      "1:1 — payroll and leave",
    );
    expect(drafts.length).toBe(2);
    expect(drafts[0].title.toLowerCase()).toContain("payroll");
    expect(drafts[1].source_quote).toMatch(/leave policy/i);
  });

  it("falls back to the call title when there is no transcript yet", () => {
    const drafts = draftCommitmentsFromCall(null, "VGG Weekly Sync");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toContain("VGG Weekly Sync");
  });
});
