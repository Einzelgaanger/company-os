export {
  MESSAGE_TEMPLATE_SEEDS,
  getTemplateSeed,
} from "./templates.js";
export type { MessageTemplateSeed } from "./templates.js";

export {
  eligibilityGate,
  isWithinWorkingWindow,
} from "./eligibility.js";
export type {
  EligibilityUser,
  EligibilityTenantSettings,
  EligibilityCommitment,
  EligibilityContext,
  EligibilityFailure,
  EligibilityResult,
} from "./eligibility.js";

export {
  bundleByDueDate,
  formatBundleTitles,
  type BundleCandidate,
} from "./bundle.js";

export {
  parseOptInCommand,
  applyStopOptOut,
  type OptInCommand,
  type OptOutPatch,
} from "./optIn.js";

export {
  CLARIFY_CONFIDENCE_FLOOR,
  SERVICE_WINDOW_HOURS,
  expireStaleBranch,
  idleConversation,
  isServiceWindowOpen,
  onCheckinSent,
  onGlobalCommand,
  onInbound,
  parseGlobalCommand,
  type ConversationAction,
  type ConversationSnapshot,
  type ConversationState,
  type GlobalCommand,
  type InboundMessage,
  type ReplyIntent,
  type TapOption,
  type Transition,
} from "./conversation.js";

export {
  sendWhatsApp,
  resolveMessagingMode,
  twilioConfigured,
  type MessagingMode,
  type TwilioSendResult,
} from "./twilio.js";
