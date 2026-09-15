// Telegram Bot API — send + webhook helpers.
import { getSecret } from "./secrets.ts";

export async function telegramBotToken(): Promise<string | null> {
  return (await getSecret("TELEGRAM_BOT_TOKEN")) || Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim() || null;
}

export async function telegramConfigured(): Promise<boolean> {
  return Boolean(await telegramBotToken());
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<string> {
  const token = await telegramBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Telegram send failed ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const messageId = data?.result?.message_id;
  return messageId != null ? `tg:${chatId}:${messageId}` : `tg:${crypto.randomUUID().slice(0, 8)}`;
}

export type TelegramInbound = {
  updateId: number;
  messageId: string;
  chatId: string;
  fromUsername: string | null;
  fromName: string | null;
  text: string;
};

/** Parse text message updates from Telegram webhook payload. */
export function parseTelegramInbound(payload: unknown): TelegramInbound[] {
  const out: TelegramInbound[] = [];
  const obj = payload as Record<string, unknown>;
  const message = (obj.message ?? obj.edited_message) as Record<string, unknown> | undefined;
  if (!message) return out;

  const chat = message.chat as Record<string, unknown> | undefined;
  const from = message.from as Record<string, unknown> | undefined;
  const text = typeof message.text === "string" ? message.text : "";
  if (!chat?.id || !text) return out;

  out.push({
    updateId: Number(obj.update_id ?? 0),
    messageId: `tg:${chat.id}:${message.message_id}`,
    chatId: String(chat.id),
    fromUsername: typeof from?.username === "string" ? from.username : null,
    fromName: [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null,
    text,
  });
  return out;
}

/** Optional shared secret for webhook URL ?secret=… */
export async function validateTelegramWebhookSecret(url: URL): Promise<boolean> {
  const expected = (await getSecret("TELEGRAM_WEBHOOK_SECRET")) || Deno.env.get("TELEGRAM_WEBHOOK_SECRET")?.trim();
  if (!expected) return true; // secret optional
  return url.searchParams.get("secret") === expected;
}
