/**
 * B5 conversation state — 05_CONVERSATION.md §5.3, §5.8.
 *
 * One commitment's check-in thread is a tiny state machine, and it has to be
 * one because two rules only hold if something remembers where the thread got
 * to: the branching check-in must cost the user one tap plus a few words, and
 * Loop must never loop — one clarifying question, then stop.
 *
 * The other reason this is state rather than a stateless handler is §5.8's
 * service window. Free-form replies to a person are legal only within 24 hours
 * of that person's last inbound message. Outside it, templates only. Every
 * multi-turn branch in §5.3 happens inside a window the user opened by
 * replying, and that is what makes it legal.
 *
 * Pure transitions. The store persists the snapshot; nothing here sends.
 */

import { parseOptInCommand } from "./optIn.js";

export type ConversationState =
  /** Nothing outstanding. The default, and where every thread returns to. */
  | "idle"
  /** A check-in went out and nothing has come back. */
  | "awaiting_reply"
  /** §5.3 — the one follow-up after "Waiting on someone". */
  | "awaiting_waiting_who"
  /** §5.3 — "Close it" or "Send them a note" after "It's done". */
  | "awaiting_done_confirm"
  /** §5.3 — the single clarifying question below 0.7 confidence. */
  | "awaiting_clarify";

/** The flow state a reply resolves to. Loop derives it; the person never picks a label. */
export type ReplyIntent =
  | "waiting"
  | "active"
  | "done"
  | "unclear";

/** §5.8 global commands, checked before classification. */
export type GlobalCommand = "stop" | "start" | "help" | "skip" | "status";

/** §5.3's three tap options plus the two on the done branch. */
export type TapOption =
  | "waiting_on_someone"
  | "im_on_it"
  | "its_done"
  | "close_it"
  | "send_them_a_note";

export type ConversationSnapshot = {
  commitmentId: string;
  state: ConversationState;
  /** §5.8 `conversations.service_window_expires_at`. Null when no window is open. */
  serviceWindowExpiresAt: string | null;
  /** Clarifying questions asked on this turn. Never more than one (§5.3). */
  clarifyCount: number;
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
};

export type InboundMessage =
  | { kind: "tap"; option: TapOption; at: string }
  | { kind: "text"; text: string; intent: ReplyIntent; confidence: number; at: string };

/** §5.8 — the window a person's inbound message opens. */
export const SERVICE_WINDOW_HOURS = 24;

/** §5.3 — below this the classifier gets one clarifying question, then stops. */
export const CLARIFY_CONFIDENCE_FLOOR = 0.7;

export function idleConversation(commitmentId: string): ConversationSnapshot {
  return {
    commitmentId,
    state: "idle",
    serviceWindowExpiresAt: null,
    clarifyCount: 0,
    lastOutboundAt: null,
    lastInboundAt: null,
  };
}

function ms(at: string): number {
  return new Date(at).getTime();
}

/**
 * §5.8. Free-form text is legal only inside the window; outside it, only an
 * approved template may go out. Callers treat `false` as "template only", not
 * as "do not send".
 */
export function isServiceWindowOpen(
  snapshot: ConversationSnapshot,
  now: Date | string = new Date(),
): boolean {
  if (!snapshot.serviceWindowExpiresAt) return false;
  const at = typeof now === "string" ? ms(now) : now.getTime();
  return at < ms(snapshot.serviceWindowExpiresAt);
}

function windowFrom(at: string): string {
  return new Date(ms(at) + SERVICE_WINDOW_HOURS * 3_600_000).toISOString();
}

/** §5.8, checked before classification so `STOP` never reaches the model. */
export function parseGlobalCommand(body: string): GlobalCommand | null {
  const t = body.trim();
  if (!t) return null;
  const optIn = parseOptInCommand(t);
  if (optIn.kind === "stop") return "stop";
  if (optIn.kind === "start") return "start";
  if (/^resume\b/i.test(t)) return "start";
  if (/^help\b/i.test(t)) return "help";
  if (/^skip\b/i.test(t)) return "skip";
  if (/^status\b/i.test(t)) return "status";
  return null;
}

export type ConversationAction =
  /** Send this template next. Null when the thread is finished for now. */
  | { kind: "send"; templateKey: string }
  | { kind: "none" };

export type Transition = {
  next: ConversationSnapshot;
  action: ConversationAction;
  /** The flow state this reply resolves the item to, if any (§5.3). */
  resolvedIntent: ReplyIntent | null;
};

/** Recording an outbound check-in. Does not open a service window — only the person can. */
export function onCheckinSent(
  snapshot: ConversationSnapshot,
  at: string,
): ConversationSnapshot {
  return { ...snapshot, state: "awaiting_reply", clarifyCount: 0, lastOutboundAt: at };
}

/**
 * §5.3. One factual question, three tap options, free text always available.
 * The branch is chosen here so the sender never has to know where the thread is.
 */
export function onInbound(
  snapshot: ConversationSnapshot,
  message: InboundMessage,
): Transition {
  const base: ConversationSnapshot = {
    ...snapshot,
    lastInboundAt: message.at,
    // Every inbound message from the person reopens the window (§5.8).
    serviceWindowExpiresAt: windowFrom(message.at),
  };

  const settle = (
    state: ConversationState,
    templateKey: string | null,
    resolvedIntent: ReplyIntent | null,
    clarifyCount = base.clarifyCount,
  ): Transition => ({
    next: { ...base, state, clarifyCount },
    action: templateKey ? { kind: "send", templateKey } : { kind: "none" },
    resolvedIntent,
  });

  if (message.kind === "tap") {
    switch (message.option) {
      case "waiting_on_someone":
        // One follow-up, then Loop takes over. Total user cost: one tap plus a
        // few words — the number to protect in every future change.
        return settle("awaiting_waiting_who", "waiting_who", null);
      case "im_on_it":
        // Zero friction for the common case is what keeps response rates alive.
        return settle("idle", "active_ack", "active");
      case "its_done":
        return settle("awaiting_done_confirm", "done_confirm", null);
      case "close_it":
        return settle("idle", "resolved_notify", "done");
      case "send_them_a_note":
        return settle("idle", "resolved_notify", "done");
    }
  }

  // Free text. The waiting branch's follow-up answer is a name, not an intent,
  // so it resolves to `waiting` whatever the classifier made of it.
  if (snapshot.state === "awaiting_waiting_who") {
    return settle("idle", "waiting_ack", "waiting");
  }

  if (message.confidence < CLARIFY_CONFIDENCE_FLOOR || message.intent === "unclear") {
    if (snapshot.clarifyCount >= 1) {
      // Never loop. A second clarifying question is how a coordination tool
      // turns into the thing people mute.
      return settle("idle", null, null);
    }
    return settle("awaiting_clarify", "clarify", null, snapshot.clarifyCount + 1);
  }

  switch (message.intent) {
    case "waiting":
      return settle("awaiting_waiting_who", "waiting_who", null);
    case "active":
      return settle("idle", "active_ack", "active");
    case "done":
      return settle("awaiting_done_confirm", "done_confirm", null);
    default:
      return settle("idle", null, null);
  }
}

/** `STOP` / `SKIP` end the thread wherever it got to, with no record of who skipped. */
export function onGlobalCommand(
  snapshot: ConversationSnapshot,
  command: GlobalCommand,
  at: string,
): Transition {
  const next: ConversationSnapshot = {
    ...snapshot,
    state: "idle",
    clarifyCount: 0,
    lastInboundAt: at,
    serviceWindowExpiresAt: windowFrom(at),
  };
  const template: Record<GlobalCommand, string | null> = {
    stop: "optout_confirm",
    start: null,
    help: "help_reply",
    skip: null,
    status: null,
  };
  const key = template[command];
  return {
    next: command === "stop" ? { ...next, serviceWindowExpiresAt: null } : next,
    action: key ? { kind: "send", templateKey: key } : { kind: "none" },
    resolvedIntent: null,
  };
}

/**
 * A thread stuck in a branch is a thread the person walked away from. Nothing
 * chases it — the next scheduled check-in starts clean.
 */
export function expireStaleBranch(
  snapshot: ConversationSnapshot,
  now: Date | string = new Date(),
): ConversationSnapshot {
  if (snapshot.state === "idle") return snapshot;
  if (isServiceWindowOpen(snapshot, now)) return snapshot;
  return { ...snapshot, state: "idle", clarifyCount: 0 };
}
