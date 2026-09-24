# Messaging launch — Chat + per-person channels

## What shipped

- **Default delivery:** `in_app` (Chat tab). No WhatsApp Meta approval required to launch.
- **Per-user preference:** `notification_prefs.preferred_channel` = `in_app` | `telegram` | `whatsapp`.
- **Edge routing:** `supabase/functions/_shared/whatsapp.ts` respects preference; falls back to in-app if the preferred channel is not linked/configured.
- **Chat tab:** `/chat` — same `checkins` thread as Telegram/WhatsApp; poll + send via `chat-inbound`.
- **Profile / Integrations:** connect Telegram (LINK) or WhatsApp (OTP when live); choose preferred channel.

## Deploy

1. Deploy Edge function `chat-inbound` and redeploy any function that imports `_shared/whatsapp.ts` / `inboundReply.ts` (at least `telegram-webhook`, `whatsapp-webhook`, `send-checkin`, `send-digest`, `escalate`, `verify-otp`).
2. Push SPA to Render (clear build cache if env changed).
3. Smoke: open `/chat`, send “hi”, confirm bot reply appears. Link one Telegram user; confirm both surfaces show the same thread.

## Ops note

WhatsApp UI is ready; delivery stays in Chat until Meta/Twilio secrets are live and the user verifies phone + sets preferred_channel to `whatsapp`.
