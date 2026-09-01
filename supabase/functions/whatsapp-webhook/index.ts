// whatsapp-webhook — Meta Cloud API + Twilio inbound receiver.
// Meta: GET verify + JSON POST (X-Hub-Signature-256). Twilio: form POST (X-Twilio-Signature).
// deno-lint-ignore-file no-explicit-any
import { json, corsHeaders } from "../_shared/supabase.ts";
import { validateTwilioSignature } from "../_shared/twilio.ts";
import {
  metaWebhookConfigured,
  verifyMetaWebhook,
  validateMetaSignature,
  parseMetaInbound,
} from "../_shared/metaWhatsApp.ts";
import { twilioConfigured } from "../_shared/twilio.ts";
import { processInboundWhatsApp } from "../_shared/inboundReply.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // Meta webhook registration handshake
  if (req.method === "GET") {
    const verified = verifyMetaWebhook(url);
    if (verified) return verified;
    return json({ error: "invalid verify token" }, 403);
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  // --- Meta Cloud API ---
  if (isJson) {
    if (!metaWebhookConfigured()) {
      return json(
        {
          error: "webhook_misconfigured",
          message: "Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET on Edge",
        },
        503,
      );
    }
    const rawBody = await req.text();
    const sig = req.headers.get("x-hub-signature-256");
    if (!validateMetaSignature(rawBody, sig)) {
      return json({ error: "invalid signature" }, 403);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid json" }, 400);
    }

    const messages = parseMetaInbound(payload);
    if (messages.length === 0) {
      return json({ ok: true, ignored: "no text messages" });
    }

    const results = [];
    for (const msg of messages) {
      const result = await processInboundWhatsApp({
        providerMessageId: msg.messageId,
        fromRaw: msg.from,
        bodyText: msg.bodyText,
      });
      results.push(result);
    }
    return json({ ok: true, processed: messages.length, results });
  }

  // --- Twilio (legacy) ---
  if (!twilioConfigured()) {
    return json(
      {
        error: "webhook_misconfigured",
        message: "No WhatsApp provider configured (Meta or Twilio env vars)",
      },
      503,
    );
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = Deno.env.get("PUBLIC_WEBHOOK_URL") ?? req.url;
  if (!validateTwilioSignature(webhookUrl, params, signature)) {
    return json({ error: "invalid signature" }, 403);
  }

  const sid = params.MessageSid || params.SmsSid;
  const from = params.From || "";
  const bodyText = params.Body ?? "";

  const result = await processInboundWhatsApp({
    providerMessageId: sid,
    fromRaw: from,
    bodyText,
  });

  if (result.deduped) return json({ deduped: true });
  if (result.error === "unknown sender") return json({ error: "unknown sender" }, 200);
  return json({ ok: true });
});
