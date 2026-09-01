// Twilio WhatsApp helpers: outbound send + inbound signature validation.
import { createHmac } from "node:crypto";

/** True when Twilio WhatsApp credentials are present. */
export function twilioConfigured(): boolean {
  return Boolean(
    Deno.env.get("TWILIO_ACCOUNT_SID") &&
      Deno.env.get("TWILIO_AUTH_TOKEN") &&
      Deno.env.get("TWILIO_WHATSAPP_NUMBER")
  );
}

/**
 * Send a WhatsApp message. Returns Twilio SID, or a synthetic in-app id when
 * Twilio is not configured (so cron/check-ins still record locally).
 */
export async function sendWhatsApp(to: string, body: string): Promise<string> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

  if (!sid || !token || !from) {
    return `INAPP-${crypto.randomUUID().slice(0, 8)}`;
  }

  const params = new URLSearchParams({
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    Body: body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!res.ok) throw new Error(`Twilio send failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.sid as string;
}

/**
 * Validate the X-Twilio-Signature header (Section 13). Twilio signs the full
 * URL plus POST params sorted alphabetically, HMAC-SHA1 with the auth token.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string): boolean {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!token || !signature) return false;
  const sorted = Object.keys(params).sort();
  let data = url;
  for (const key of sorted) data += key + params[key];
  const expected = createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  return expected === signature;
}
