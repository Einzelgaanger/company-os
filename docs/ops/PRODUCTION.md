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

Key is stored in `.env`, Edge secrets, and `app_secrets`.  
Listing models works (200); **chat completions fail with 401 User not found** — replace with a valid OpenRouter key that has chat credit:

```bash
# update .env OPENROUTER_API_KEY=sk-or-v1-...
node scripts/ops/set-openrouter-secret.mjs
npx supabase secrets set --project-ref pkxnfkubgpbdbftvtgvf OPENROUTER_API_KEY=sk-or-v1-... OPENROUTER_MODEL=anthropic/claude-sonnet-4
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
