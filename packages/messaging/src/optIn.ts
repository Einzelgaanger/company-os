/**
 * Inbound WhatsApp STOP / START handling — Phase 3 / C-6.
 * Immediate permanent opt-out on STOP keywords.
 */

const STOP_RE = /^(stop|unsubscribe|cancel|end|quit)\b/i;
const START_RE = /^(start|unstop|subscribe)\b/i;

export type OptInCommand =
  | { kind: "stop" }
  | { kind: "start" }
  | { kind: "none" };

export function parseOptInCommand(body: string): OptInCommand {
  const t = body.trim();
  if (!t) return { kind: "none" };
  if (STOP_RE.test(t)) return { kind: "stop" };
  if (START_RE.test(t)) return { kind: "start" };
  return { kind: "none" };
}

export type OptOutPatch = {
  whatsappOptOutAt: string;
};

/** Permanent opt-out — leave prior opt-in timestamp; eligibility fails on opt_out set. */
export function applyStopOptOut(now: Date = new Date()): OptOutPatch {
  return {
    whatsappOptOutAt: now.toISOString(),
  };
}
