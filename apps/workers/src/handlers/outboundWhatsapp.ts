/**
 * Outbound WhatsApp job — eligibility + optional manual approve + Twilio (Phase 3).
 * live mode without Twilio credentials fails loudly — never silent INAPP success.
 */
import {
  eligibilityGate,
  sendWhatsApp,
  resolveMessagingMode,
  type EligibilityContext,
  type MessagingMode,
} from "@loop/messaging";
import { resolveFeatureFlags } from "@loop/shared";

export type OutboundResult =
  | { status: "sent"; templateKey: string; providerMessageId: string; mode: MessagingMode }
  | { status: "queued_for_approval"; templateKey: string }
  | { status: "reschedule"; reason: string }
  | { status: "failed"; reason: string; mode: MessagingMode };

export async function processOutboundWhatsApp(input: {
  templateKey: string;
  body?: string;
  toE164?: string;
  eligibility: EligibilityContext;
  messagingMode?: string | null;
}): Promise<OutboundResult> {
  const gate = eligibilityGate(input.eligibility);
  if (!gate.ok) {
    return { status: "reschedule", reason: gate.reason };
  }

  const flags = resolveFeatureFlags();
  if (flags.whatsapp_manual_approve) {
    return {
      status: "queued_for_approval",
      templateKey: input.templateKey,
    };
  }

  const mode = resolveMessagingMode(input.messagingMode);
  const to = input.toE164;
  if (!to && mode === "live") {
    return { status: "failed", reason: "missing_recipient_phone", mode };
  }

  const send = await sendWhatsApp({
    toE164: to ?? "+10000000000",
    body: input.body ?? `[Loop] ${input.templateKey}`,
    mode,
  });

  if (!send.ok) {
    return { status: "failed", reason: send.error, mode: send.mode };
  }

  return {
    status: "sent",
    templateKey: input.templateKey,
    providerMessageId: send.sid,
    mode: send.mode,
  };
}
