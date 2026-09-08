# Loop — production pilot status

**Project:** `pkxnfkubgpbdbftvtgvf` (*ProDG Internal Dani* — rename to **Loop** in dashboard)  
**Region:** eu-north-1  
**URL:** https://pkxnfkubgpbdbftvtgvf.supabase.co  
**Last full setup:** 2026-08-20

## Live checklist

| Step | Status |
|---|---|
| CLI linked | Done |
| Migrations `0001`–`0008` | Up to date |
| `app_secrets` (OpenRouter in DB) | Done |
| Edge secrets (OpenRouter + public URLs) | Done |
| 9 edge functions deployed | Done |
| Cron + vault `loop_service_role_key` | Done (5 jobs) |
| Demo seed | Done |
| Smoke (`npm run smoke:prod`) | **8/8 passed** |
| OpenRouter chat completions | **Blocked — key returns 401 User not found** |

### Demo login
```
email:    alfred@prodg.studio
password: LoopDemo2026!
```

```bash
npm run dev
# http://localhost:5173 → sign in with demo credentials (real Supabase, not mock)
```

### Functions deployed
`ingest-meeting`, `extract-commitments`, `send-checkin`, `escalate`, `generate-report`, `verify-otp`, `oauth`, `send-digest`, `whatsapp-webhook`

### Cron
- `loop-send-checkin` — hourly  
- `loop-escalate-sweep` — every 30 min  
- `loop-send-digest` — hourly  
- `loop-generate-report-daily` — 06:00 UTC  
- `loop-retention-purge` — 02:30 UTC  

## OpenRouter

Keys are read **from `app_secrets` in Postgres first**, then Edge env (`OPENROUTER_*`).  
Listing models works (200); if chat completions fail with **401**, replace the key:

```bash
# update .env OPENROUTER_API_KEY=sk-or-v1-...
npm run ops:openrouter-secret
```

Edge functions (`extract-commitments`, `generate-report`, inbound classify) all use `_shared/secrets.ts` → `app_secrets`.

## Production hosting (ProDG) — Render + Supabase only

| Layer | Host |
|-------|------|
| SPA | **Render** — https://company-os-cce2.onrender.com |
| Auth / DB / WhatsApp / AI / cron | **Supabase** — `pkxnfkubgpbdbftvtgvf` |

Coolify is **deferred**. Full steps: [`docs/ops/RENDER.md`](./RENDER.md).

```env
VITE_SUPABASE_URL=https://pkxnfkubgpbdbftvtgvf.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_PUBLIC_SITE_URL=https://company-os-cce2.onrender.com
# Do NOT set VITE_ALLOW_MOCK or VITE_API_URL
```

## New edge functions (2026-09-01)

`launch-readiness`, `fathom-webhook`, `sync-calendar`, `workos-webhook`, `chat-webhook`

Apply migration `0009_production_infra.sql`:

```bash
npm run ops:supabase-migrate
```

## Still optional

```bash
npx supabase secrets set --project-ref pkxnfkubgpbdbftvtgvf \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_WHATSAPP_NUMBER=whatsapp:+1... \
  FATHOM_API_KEY=...
```

Without Twilio, check-ins stay **in_app** (Inbox) — already working.

## Re-smoke

```bash
npm run smoke:prod
```
