import type { User } from "@/lib/types";

/** True when the user can receive Telegram (preferred) or WhatsApp fallback. */
export function messagingLinked(user: Pick<User, "telegram_linked_at" | "telegram_chat_id" | "phone_verified_at">): boolean {
  return Boolean(user.telegram_linked_at || user.telegram_chat_id || user.phone_verified_at);
}

export function messagingLinkLabel(user: Pick<User, "telegram_linked_at" | "telegram_chat_id" | "phone_verified_at">): string {
  if (user.telegram_linked_at || user.telegram_chat_id) return "Telegram linked";
  if (user.phone_verified_at) return "WhatsApp verified";
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
      return channel || "in-app";
  }
}
