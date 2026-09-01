// Unified WhatsApp transport — Meta Cloud API (preferred) or Twilio fallback.
import { metaConfigured, sendMetaWhatsApp } from "./metaWhatsApp.ts";
import { twilioConfigured } from "./twilio.ts";
import { sendWhatsApp as sendTwilioWhatsApp } from "./twilio.ts";

export type WhatsAppProvider = "meta" | "twilio" | "in_app";

export function whatsappProvider(): WhatsAppProvider {
  if (metaConfigured()) return "meta";
  if (twilioConfigured()) return "twilio";
  return "in_app";
}

export function whatsappConfigured(): boolean {
  return whatsappProvider() !== "in_app";
}

/** Send a text message; returns provider message id (or INAPP-* stub). */
export async function sendWhatsApp(to: string, body: string): Promise<string> {
  const provider = whatsappProvider();
  if (provider === "meta") return sendMetaWhatsApp(to, body);
  if (provider === "twilio") return sendTwilioWhatsApp(to, body);
  return `INAPP-${crypto.randomUUID().slice(0, 8)}`;
}
