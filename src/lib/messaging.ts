import type { PreferredMessagingChannel, User } from "@/lib/types";

export type MessagingChannelReady = PreferredMessagingChannel;

const DEFAULT_CHANNEL: PreferredMessagingChannel = "in_app";

export function preferredChannel(
  user: Pick<User, "notification_prefs"> | null | undefined,
): PreferredMessagingChannel {
  return user?.notification_prefs?.preferred_channel ?? DEFAULT_CHANNEL;
}

/** Telegram linked, WhatsApp phone verified, or in-app (always). */
export function channelReady(
  user: Pick<User, "telegram_linked_at" | "telegram_chat_id" | "phone_verified_at">,
  channel: PreferredMessagingChannel,
): boolean {
  if (channel === "in_app") return true;
  if (channel === "telegram") return Boolean(user.telegram_linked_at || user.telegram_chat_id);
  if (channel === "whatsapp") return Boolean(user.phone_verified_at);
  return false;
}

/**
 * True when the user can receive check-ins on their preferred channel,
 * or on in-app (always available for launch).
 */
export function messagingLinked(
  user: Pick<User, "telegram_linked_at" | "telegram_chat_id" | "phone_verified_at" | "notification_prefs">,
): boolean {
  const pref = preferredChannel(user);
  if (pref === "in_app") return true;
  return channelReady(user, pref) || channelReady(user, "in_app");
}

/** Whether an external (TG/WA) identity is connected — used for status badges. */
export function externalMessagingLinked(
  user: Pick<User, "telegram_linked_at" | "telegram_chat_id" | "phone_verified_at">,
): boolean {
  return Boolean(user.telegram_linked_at || user.telegram_chat_id || user.phone_verified_at);
}

export function messagingLinkLabel(
  user: Pick<User, "telegram_linked_at" | "telegram_chat_id" | "phone_verified_at" | "notification_prefs">,
): string {
  const pref = preferredChannel(user);
  if (pref === "telegram" && (user.telegram_linked_at || user.telegram_chat_id)) {
    return "Telegram linked";
  }
  if (pref === "whatsapp" && user.phone_verified_at) return "WhatsApp verified";
  if (user.telegram_linked_at || user.telegram_chat_id) return "Telegram linked";
  if (user.phone_verified_at) return "WhatsApp verified";
  if (pref === "in_app") return "In-app Chat";
  return "Not linked";
}

export function channelDisplayName(channel: string | null | undefined): string {
  switch (channel) {
    case "telegram":
      return "Telegram";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    case "in_app":
      return "In-app";
    default:
      return channel || "In-app";
  }
}

export function preferredChannelLabel(channel: PreferredMessagingChannel): string {
  switch (channel) {
    case "telegram":
      return "Telegram";
    case "whatsapp":
      return "WhatsApp";
    default:
      return "In-app Chat";
  }
}
