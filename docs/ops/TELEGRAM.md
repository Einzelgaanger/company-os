# Telegram messaging (primary channel) — Company OS

Company OS prefers **Telegram** when `TELEGRAM_BOT_TOKEN` is set. WhatsApp (Meta/Twilio) remains an optional fallback.

## 1. Create a bot

1. Open Telegram → talk to [@BotFather](https://t.me/BotFather)
2. `/newbot` → name it e.g. **Company OS**
3. Copy the **bot token**

## 2. Put the token in `.env`

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_SECRET=optional-random-string
```

## 3. Migrate + deploy + register webhook

```bash
node scripts/ops/apply-supabase-migration.mjs 0011_telegram.sql
npx supabase functions deploy telegram-webhook send-checkin escalate verify-otp whatsapp-webhook --project-ref pkxnfkubgpbdbftvtgvf
npm run ops:telegram-webhook
```

Webhook URL:

`https://pkxnfkubgpbdbftvtgvf.supabase.co/functions/v1/telegram-webhook`

## 4. Link each Company OS user

From Telegram, open your bot and send:

```text
LINK +254700861129
```

(Use the phone number already stored on that user’s profile.)

Bot replies **Linked** when successful.

## 5. Test

- Send `Hi` → Company OS intro ack
- Trigger a check-in → reply `on track` / `blocked` / `done`

## Priority

| Config | Channel used |
|--------|----------------|
| `TELEGRAM_BOT_TOKEN` + user linked | **telegram** |
| Meta WhatsApp vars + phone verified | whatsapp |
| neither | in_app inbox |
