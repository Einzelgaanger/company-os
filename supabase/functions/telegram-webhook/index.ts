// telegram-webhook — Telegram Bot API inbound receiver.
// Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PUBLIC_URL>
// Optional: append ?secret=<TELEGRAM_WEBHOOK_SECRET>
// deno-lint-ignore-file no-explicit-any
import { json, corsHeaders } from "../_shared/supabase.ts";
import {
  telegramConfigured,
  parseTelegramInbound,
  validateTelegramWebhookSecret,
} from "../_shared/telegram.ts";
import { processInboundTelegram } from "../_shared/inboundReply.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (!(await validateTelegramWebhookSecret(url))) {
    return json({ error: "invalid secret" }, 403);
  }

  if (req.method === "GET") {
    const ok = await telegramConfigured();
    return json({
      ok,
      service: "telegram-webhook",
      configured: ok,
      hint: ok ? "POST Telegram updates here" : "Set TELEGRAM_BOT_TOKEN in Edge secrets",
    });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!(await telegramConfigured())) {
    return json({ error: "telegram_not_configured" }, 503);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const messages = parseTelegramInbound(payload);
  if (messages.length === 0) {
    return json({ ok: true, ignored: "no text messages" });
  }

  const results = [];
  for (const msg of messages) {
    const result = await processInboundTelegram({
      providerMessageId: msg.messageId,
      chatId: msg.chatId,
      username: msg.fromUsername,
      bodyText: msg.text,
    });
    results.push(result);
  }
  return json({ ok: true, processed: messages.length, results });
});
