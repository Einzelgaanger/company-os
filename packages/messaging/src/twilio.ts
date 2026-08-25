/**
 * Twilio WhatsApp client — live send or fail loudly (09_CONNECTORS §9.6).
 * No silent INAPP-* fallback.
 */
export type MessagingMode = "live" | "in_app" | "sandbox";

export function resolveMessagingMode(
  tenantMode?: string | null,
): MessagingMode {
  const m = (tenantMode ?? process.env.MESSAGING_MODE ?? "in_app").toLowerCase();
  if (m === "live" || m === "sandbox" || m === "in_app") return m;
  return "in_app";
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_NUMBER?.trim(),
  );
}

export type TwilioSendResult =
  | { ok: true; sid: string; mode: MessagingMode }
  | { ok: false; error: string; mode: MessagingMode };

/**
 * Send a WhatsApp template/body. `toE164` must be E.164 (with or without whatsapp:).
 */
export async function sendWhatsApp(input: {
  toE164: string;
  body: string;
  mode?: MessagingMode;
}): Promise<TwilioSendResult> {
  const mode = input.mode ?? resolveMessagingMode();

  if (mode === "in_app") {
    return { ok: true, sid: `INAPP-${Date.now()}`, mode };
  }

  if (mode === "sandbox" && process.env.NODE_ENV === "production") {
    return { ok: false, error: "sandbox_forbidden_in_production", mode };
  }

  if (mode === "sandbox") {
    return { ok: true, sid: `SANDBOX-${Date.now()}`, mode };
  }

  // live
  if (!twilioConfigured()) {
    return {
      ok: false,
      error: "twilio_not_configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER",
      mode,
    };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_NUMBER!.startsWith("whatsapp:")
    ? process.env.TWILIO_WHATSAPP_NUMBER!
    : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER!}`;
  const to = input.toE164.startsWith("whatsapp:")
    ? input.toE164
    : `whatsapp:${input.toE164}`;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({ From: from, To: to, Body: input.body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `twilio_send_failed:${res.status}:${text.slice(0, 300)}`,
      mode,
    };
  }

  const json = (await res.json()) as { sid?: string };
  if (!json.sid) {
    return { ok: false, error: "twilio_send_failed:missing_sid", mode };
  }
  return { ok: true, sid: json.sid, mode };
}
