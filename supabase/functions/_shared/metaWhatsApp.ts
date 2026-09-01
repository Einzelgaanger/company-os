// Meta WhatsApp Cloud API — webhook verify, signature check, send.
import { createHmac } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

function phoneNumberId(): string | undefined {
  return (
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() ||
    Deno.env.get("WHATSAPP_PHONE_ID")?.trim()
  );
}

function wabaId(): string | undefined {
  return Deno.env.get("META_WABA_ID")?.trim() || Deno.env.get("WHATSAPP_WABA_ID")?.trim();
}

export function metaConfigured(): boolean {
  return Boolean(Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim() && phoneNumberId());
}

export function metaWebhookConfigured(): boolean {
  return Boolean(
    metaConfigured() && Deno.env.get("WHATSAPP_APP_SECRET")?.trim(),
  );
}

/** E.164 for DB lookup — Meta sends digits without + */
export function normalizePhoneE164(from: string): string {
  const trimmed = from.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : trimmed;
}

export function metaDigits(to: string): string {
  return to.replace(/^\+/, "").replace(/\D/g, "");
}

/** GET hub.verify_token handshake when registering the webhook in Meta Developer Console. */
export function verifyMetaWebhook(url: URL): Response | null {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN")?.trim();
  if (!expected) return null;
  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export function validateMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = Deno.env.get("WHATSAPP_APP_SECRET")?.trim();
  if (!secret || !signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.replace(/^sha256=/i, "").toLowerCase();
  if (expected.length !== received.length) return false;
  // String compare — Buffer/timingSafeEqual is unreliable on Supabase Deno edge.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

export type MetaInboundMessage = {
  messageId: string;
  from: string;
  bodyText: string;
};

/** Parse Cloud API webhook JSON; ignores status-only notifications. */
export function parseMetaInbound(payload: unknown): MetaInboundMessage[] {
  const out: MetaInboundMessage[] = [];
  if (!payload || typeof payload !== "object") return out;
  const obj = payload as Record<string, unknown>;
  if (obj.object !== "whatsapp_business_account") return out;

  for (const entry of (obj.entry as unknown[]) ?? []) {
    if (!entry || typeof entry !== "object") continue;
    for (const change of ((entry as Record<string, unknown>).changes as unknown[]) ?? []) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value as Record<string, unknown> | undefined;
      if (!value) continue;
      for (const msg of (value.messages as unknown[]) ?? []) {
        if (!msg || typeof msg !== "object") continue;
        const m = msg as Record<string, unknown>;
        if (m.type !== "text") continue;
        const text = m.text as Record<string, unknown> | undefined;
        const body = String(text?.body ?? "");
        const from = String(m.from ?? "");
        const messageId = String(m.id ?? "");
        if (from && messageId && body) {
          out.push({ messageId, from, bodyText: body });
        }
      }
    }
  }
  return out;
}

export async function sendMetaWhatsApp(to: string, body: string): Promise<string> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!.trim();
  const phoneNumberIdVal = phoneNumberId()!;

  const res = await fetch(`${GRAPH}/${phoneNumberIdVal}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaDigits(to),
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) throw new Error(`Meta WhatsApp send failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  return data.messages?.[0]?.id ?? `META-${crypto.randomUUID().slice(0, 8)}`;
}
