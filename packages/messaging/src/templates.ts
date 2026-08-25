/**
 * Template registry — docs/design/05_CONVERSATION.md evidence-based check-ins.
 * Never ask "how's it going"; ask for observable facts. All utility / en.
 */

export type MessageTemplateSeed = {
  templateKey: string;
  purpose: string;
  category: "utility";
  language: "en";
  body: string;
  variableCount: number;
};

export const MESSAGE_TEMPLATE_SEEDS: MessageTemplateSeed[] = [
  {
    templateKey: "otp_verify",
    purpose: "Onboarding verification",
    category: "utility",
    language: "en",
    body: "Your Loop verification code is {{1}}. It expires in 10 minutes.",
    variableCount: 1,
  },
  {
    templateKey: "checkin_evidence",
    purpose: "Evidence check-in (primary)",
    category: "utility",
    language: "en",
    body: "Hi {{1}} — on *{{2}}*: has anything moved since {{3}}? Reply DONE, WAITING (who/what), or STILL WORKING.",
    variableCount: 3,
  },
  {
    templateKey: "checkin_pre_due",
    purpose: "Before committed date",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, *{{2}}* is committed for {{3}}. Reply DONE if finished, WAITING if blocked (name who), or STILL WORKING.",
    variableCount: 3,
  },
  {
    templateKey: "checkin_bundle",
    purpose: "Multiple items same day",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, a few items need a fact update: {{2}}. For each, reply DONE / WAITING / STILL WORKING.",
    variableCount: 2,
  },
  {
    templateKey: "checkin_aging",
    purpose: "Item waiting too long",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, *{{2}}* has been waiting {{3}} working days. Who or what is it waiting on now?",
    variableCount: 3,
  },
  {
    templateKey: "clarify",
    purpose: "Reply unclear",
    category: "utility",
    language: "en",
    body: "Thanks — for *{{1}}*, please reply with one of: DONE, WAITING (who/what), or STILL WORKING.",
    variableCount: 1,
  },
  {
    templateKey: "unblock_request",
    purpose: "Ask holder to unblock before escalate",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, *{{2}}* is waiting on you ({{3}} working days). Can you unblock it, or reply who should take it?",
    variableCount: 3,
  },
  {
    templateKey: "escalation_notify",
    purpose: "Escalation ladder step",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, *{{2}}* is still waiting with {{3}} after {{4}} working days. Last note: \"{{5}}\". Can you help move it?",
    variableCount: 5,
  },
  {
    templateKey: "escalation_ack",
    purpose: "Requester notified of escalation",
    category: "utility",
    language: "en",
    body: "Update on *{{1}}*: {{2}} is now helping to unblock it.",
    variableCount: 2,
  },
  {
    templateKey: "confirm_resolved",
    purpose: "Marked done",
    category: "utility",
    language: "en",
    body: "*{{1}}* is marked done. {{2}}",
    variableCount: 2,
  },
  {
    templateKey: "help_reply",
    purpose: "HELP command",
    category: "utility",
    language: "en",
    body: "Loop commands: DONE, WAITING, STILL WORKING, STOP (opt out), HELP. For *{{1}}* reply one status word.",
    variableCount: 1,
  },
  {
    templateKey: "nudge_feedback",
    purpose: "Ask if nudge was useful",
    category: "utility",
    language: "en",
    body: "Was that check-in useful for *{{1}}*? Reply YES or NO (helps us stop noisy nudges).",
    variableCount: 1,
  },
  {
    templateKey: "survey_invite",
    purpose: "Start a survey",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, {{2}} short questions about how work flows (not about people). Reply START or SKIP.",
    variableCount: 2,
  },
  {
    templateKey: "optout_confirm",
    purpose: "Confirming opt-out",
    category: "utility",
    language: "en",
    body: "You're unsubscribed from Loop WhatsApp messages. Reply START in settings or message START to re-subscribe.",
    variableCount: 0,
  },
];

export function getTemplateSeed(
  templateKey: string,
): MessageTemplateSeed | undefined {
  return MESSAGE_TEMPLATE_SEEDS.find((t) => t.templateKey === templateKey);
}
