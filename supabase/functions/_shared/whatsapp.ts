// Unified outbound messaging — Telegram (preferred) → Meta WhatsApp → Twilio → in_app.
import { telegramConfigured, sendTelegramMessage } from "./telegram.ts";
import { metaConfigured, sendMetaWhatsApp } from "./metaWhatsApp.ts";
import { twilioConfigured, sendWhatsApp as sendTwilioWhatsApp } from "./twilio.ts";

export type MessagingChannel = "telegram" | "whatsapp" | "in_app";
export type MessagingProvider = "telegram" | "meta" | "twilio" | "in_app";

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
};

/** Prefer Telegram chat when linked; else WhatsApp phone when verified. */
export async function resolveOutboundChannel(user: MessagingUser): Promise<MessagingChannel> {
  const provider = await messagingProvider();
  if (provider === "telegram" && user.telegram_chat_id) return "telegram";
  if ((provider === "meta" || provider === "twilio") && user.phone_verified_at && user.phone_number) {
    return "whatsapp";
  }
  // Telegram configured but user not linked yet → in_app
  if (provider === "telegram") return "in_app";
  return "in_app";
}

export async function sendOutbound(user: MessagingUser, body: string): Promise<{ sid: string; channel: MessagingChannel }> {
  const channel = await resolveOutboundChannel(user);
  if (channel === "telegram" && user.telegram_chat_id) {
    const sid = await sendTelegramMessage(user.telegram_chat_id, body);
    return { sid, channel };
  }
  if (channel === "whatsapp" && user.phone_number) {
    const provider = await messagingProvider();
    const sid =
      provider === "meta"
        ? await sendMetaWhatsApp(user.phone_number, body)
        : await sendTwilioWhatsApp(user.phone_number, body);
    return { sid, channel };
  }
  return { sid: `INAPP-${crypto.randomUUID().slice(0, 8)}`, channel: "in_app" };
}

// ---- Back-compat aliases used by existing edge functions ----
export type WhatsAppProvider = MessagingProvider;

export function whatsappProvider(): WhatsAppProvider {
  // Sync peek for Meta/Twilio only — callers that need Telegram should use messagingProvider().
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
  // If only Telegram is configured, treat `to` as a chat id.
  if (await telegramConfigured()) return sendTelegramMessage(to, body);
  return `INAPP-${crypto.randomUUID().slice(0, 8)}`;
}
