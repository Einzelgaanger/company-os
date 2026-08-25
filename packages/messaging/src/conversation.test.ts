import { describe, expect, it } from "vitest";
import {
  CLARIFY_CONFIDENCE_FLOOR,
  SERVICE_WINDOW_HOURS,
  expireStaleBranch,
  idleConversation,
  isServiceWindowOpen,
  onCheckinSent,
  onGlobalCommand,
  onInbound,
  parseGlobalCommand,
  type ConversationSnapshot,
} from "./conversation.js";

const SENT_AT = "2026-08-24T09:00:00.000Z";
const REPLIED_AT = "2026-08-24T09:04:00.000Z";

function awaitingReply(): ConversationSnapshot {
  return onCheckinSent(idleConversation("c1"), SENT_AT);
}

describe("§5.3 the check-in branches", () => {
  it("starts idle and goes to awaiting_reply when the check-in goes out", () => {
    const idle = idleConversation("c1");
    expect(idle.state).toBe("idle");
    expect(onCheckinSent(idle, SENT_AT).state).toBe("awaiting_reply");
  });

  it("costs one tap plus a few words on the waiting branch", () => {
    const asked = onInbound(awaitingReply(), {
      kind: "tap",
      option: "waiting_on_someone",
      at: REPLIED_AT,
    });
    expect(asked.next.state).toBe("awaiting_waiting_who");
    expect(asked.action).toEqual({ kind: "send", templateKey: "waiting_who" });
    expect(asked.resolvedIntent).toBeNull();

    // The follow-up answer is a name, and Loop takes over from there.
    const answered = onInbound(asked.next, {
      kind: "text",
      text: "kayode, he pointed me to someone in IT",
      intent: "unclear",
      confidence: 0.2,
      at: "2026-08-24T09:05:00.000Z",
    });
    expect(answered.next.state).toBe("idle");
    expect(answered.resolvedIntent).toBe("waiting");
    expect(answered.action).toEqual({ kind: "send", templateKey: "waiting_ack" });
  });

  it("asks nothing further on the common case", () => {
    const t = onInbound(awaitingReply(), { kind: "tap", option: "im_on_it", at: REPLIED_AT });
    expect(t.next.state).toBe("idle");
    expect(t.resolvedIntent).toBe("active");
    expect(t.action).toEqual({ kind: "send", templateKey: "active_ack" });
  });

  it("corroborates a done claim lightly rather than interrogating it", () => {
    const done = onInbound(awaitingReply(), { kind: "tap", option: "its_done", at: REPLIED_AT });
    expect(done.next.state).toBe("awaiting_done_confirm");
    expect(done.resolvedIntent).toBeNull();

    const closed = onInbound(done.next, {
      kind: "tap",
      option: "close_it",
      at: "2026-08-24T09:06:00.000Z",
    });
    expect(closed.next.state).toBe("idle");
    expect(closed.resolvedIntent).toBe("done");
  });

  it("classifies confident free text without a follow-up", () => {
    const t = onInbound(awaitingReply(), {
      kind: "text",
      text: "still going, should land tomorrow",
      intent: "active",
      confidence: 0.91,
      at: REPLIED_AT,
    });
    expect(t.next.state).toBe("idle");
    expect(t.resolvedIntent).toBe("active");
  });
});

describe("§5.3 never loop", () => {
  const vague = {
    kind: "text" as const,
    text: "hmm",
    intent: "unclear" as const,
    confidence: 0.3,
    at: REPLIED_AT,
  };

  it("clarifies once below the confidence floor", () => {
    expect(CLARIFY_CONFIDENCE_FLOOR).toBe(0.7);
    const first = onInbound(awaitingReply(), vague);
    expect(first.next.state).toBe("awaiting_clarify");
    expect(first.next.clarifyCount).toBe(1);
    expect(first.action).toEqual({ kind: "send", templateKey: "clarify" });
  });

  it("stops rather than asking a second time", () => {
    const first = onInbound(awaitingReply(), vague);
    const second = onInbound(first.next, { ...vague, at: "2026-08-24T09:07:00.000Z" });
    expect(second.next.state).toBe("idle");
    expect(second.action).toEqual({ kind: "none" });
  });

  it("treats a confident reply just under the floor as unclear", () => {
    const t = onInbound(awaitingReply(), { ...vague, intent: "active", confidence: 0.69 });
    expect(t.next.state).toBe("awaiting_clarify");
  });
});

describe("§5.8 the service window", () => {
  it("is closed until the person replies", () => {
    expect(isServiceWindowOpen(awaitingReply(), SENT_AT)).toBe(false);
  });

  it("opens for 24 hours from the person's last inbound message", () => {
    const t = onInbound(awaitingReply(), { kind: "tap", option: "im_on_it", at: REPLIED_AT });
    expect(t.next.serviceWindowExpiresAt).toBe("2026-08-25T09:04:00.000Z");
    expect(isServiceWindowOpen(t.next, "2026-08-25T08:00:00.000Z")).toBe(true);
    expect(isServiceWindowOpen(t.next, "2026-08-25T10:00:00.000Z")).toBe(false);
    expect(SERVICE_WINDOW_HOURS).toBe(24);
  });

  it("drops a branch nobody came back to instead of chasing it", () => {
    const asked = onInbound(awaitingReply(), {
      kind: "tap",
      option: "waiting_on_someone",
      at: REPLIED_AT,
    }).next;
    expect(expireStaleBranch(asked, "2026-08-25T08:00:00.000Z").state).toBe("awaiting_waiting_who");
    const expired = expireStaleBranch(asked, "2026-08-26T09:00:00.000Z");
    expect(expired.state).toBe("idle");
    expect(expired.clarifyCount).toBe(0);
  });
});

describe("§5.8 global commands", () => {
  it("recognises every documented command, including the HELP v2 was missing", () => {
    expect(parseGlobalCommand("STOP")).toBe("stop");
    expect(parseGlobalCommand("unsubscribe")).toBe("stop");
    expect(parseGlobalCommand("quit")).toBe("stop");
    expect(parseGlobalCommand("START")).toBe("start");
    expect(parseGlobalCommand("resume")).toBe("start");
    expect(parseGlobalCommand("HELP")).toBe("help");
    expect(parseGlobalCommand("skip")).toBe("skip");
    expect(parseGlobalCommand("status")).toBe("status");
    expect(parseGlobalCommand("what's the latest on Atlas")).toBeNull();
  });

  it("confirms an opt-out once and closes the window", () => {
    const t = onGlobalCommand(awaitingReply(), "stop", REPLIED_AT);
    expect(t.action).toEqual({ kind: "send", templateKey: "optout_confirm" });
    expect(t.next.state).toBe("idle");
    expect(t.next.serviceWindowExpiresAt).toBeNull();
  });

  it("exits a survey cleanly with nothing sent back", () => {
    const t = onGlobalCommand(awaitingReply(), "skip", REPLIED_AT);
    expect(t.next.state).toBe("idle");
    expect(t.action).toEqual({ kind: "none" });
  });
});
