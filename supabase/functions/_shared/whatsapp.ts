// Unified outbound messaging — per-user preferred channel, then capability fallback.
import { telegramConfigured, sendTelegramMessage } from "./telegram.ts";
import { metaConfigured, sendMetaWhatsApp } from "./metaWhatsApp.ts";
import { twilioConfigured, sendWhatsApp as sendTwilioWhatsApp } from "./twilio.ts";

export type MessagingChannel = "telegram" | "whatsapp" | "in_app";
export type MessagingProvider = "telegram" | "meta" | "twilio" | "in_app";
export type PreferredChannel = "in_app" | "telegram" | "whatsapp";

export async function messagingProvider(): Promise<MessagingProvider> {
  if (await telegramConfigured()) return "telegram";
  if (metaConfigured()) return "meta";
  if (twilioConfigured()) return "twilio";
  return "in_app";
}

export async function messagingConfigured(): Promise<boolean> {
  return (await messagingProvider()) !== "in_app";
}

export type MessagingUser = {
  phone_number?: string | null;
  phone_verified_at?: string | null;
  telegram_chat_id?: string | null;
  telegram_linked_at?: string | null;
  notification_prefs?: {
    whatsapp_checkins?: boolean;
    preferred_channel?: PreferredChannel;
    daily_digest?: boolean;
  } | null;
};

function preferredOf(user: MessagingUser): PreferredChannel {
  return user.notification_prefs?.preferred_channel ?? "in_app";
}

function telegramReady(user: MessagingUser): boolean {
  return Boolean(user.telegram_chat_id);
}

function whatsappReady(user: MessagingUser): boolean {
  return Boolean(user.phone_verified_at && user.phone_number);
}

async function whatsappProviderLive(): Promise<boolean> {
  return metaConfigured() || twilioConfigured();
}

/**
 * Per-user routing:
 * 1. Master opt-out → in_app (caller still writes checkins for Chat)
 * 2. preferred_channel when that channel is ready
 * 3. Else in_app (launch default — no Meta required)
 */
export async function resolveOutboundChannel(user: MessagingUser): Promise<MessagingChannel> {
  if (user.notification_prefs?.whatsapp_checkins === false) return "in_app";

  const preferred = preferredOf(user);

  if (preferred === "telegram" && telegramReady(user) && (await telegramConfigured())) {
    return "telegram";
  }
  if (preferred === "whatsapp" && whatsappReady(user) && (await whatsappProviderLive())) {
    return "whatsapp";
  }
  if (preferred === "in_app") return "in_app";

  // Preferred external channel not ready — stay in-app so Chat still works.
  return "in_app";
}

export async function sendOutbound(
  user: MessagingUser,
  body: string,
): Promise<{ sid: string; channel: MessagingChannel }> {
  const channel = await resolveOutboundChannel(user);
  if (channel === "telegram" && user.telegram_chat_id) {
    const sid = await sendTelegramMessage(user.telegram_chat_id, body);
    return { sid, channel };
  }
  if (channel === "whatsapp" && user.phone_number) {
    const sid = metaConfigured()
      ? await sendMetaWhatsApp(user.phone_number, body)
      : await sendTwilioWhatsApp(user.phone_number, body);
    return { sid, channel };
  }
  return { sid: `INAPP-${crypto.randomUUID().slice(0, 8)}`, channel: "in_app" };
}

// ---- Back-compat aliases used by existing edge functions ----
export type WhatsAppProvider = MessagingProvider;

export function whatsappProvider(): WhatsAppProvider {
  if (metaConfigured()) return "meta";
  if (twilioConfigured()) return "twilio";
  return "in_app";
}

export function whatsappConfigured(): boolean {
  return whatsappProvider() !== "in_app";
}

/** @deprecated Prefer sendOutbound(user, body). Kept for Meta/Twilio phone sends. */
export async function sendWhatsApp(to: string, body: string): Promise<string> {
  if (metaConfigured()) return sendMetaWhatsApp(to, body);
  if (twilioConfigured()) return sendTwilioWhatsApp(to, body);
  if (await telegramConfigured()) return sendTelegramMessage(to, body);
  return `INAPP-${crypto.randomUUID().slice(0, 8)}`;
}
