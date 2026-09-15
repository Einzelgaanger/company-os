# Company OS production — Render SPA + Supabase

**This is the production hosting path.** Coolify is deferred.

| Piece | Where |
|-------|--------|
| **Web app (SPA)** | `https://companyos.jabali.studio` (Render + custom domain) |
| **Auth, DB, Telegram (+ WhatsApp fallback), AI, cron** | Supabase — `pkxnfkubgpbdbftvtgvf` |

## Render Dashboard → Environment

Set these **build-time** env vars (Vite bakes them into the JS):

```env
VITE_SUPABASE_URL=https://pkxnfkubgpbdbftvtgvf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBreG5ma3ViZ3BiZGJmdHZ0Z3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MTQzMjIsImV4cCI6MjEwMTM5MDMyMn0.58gAIN2dpUWjMqCdBK4AEoo1LqT79cNNRv9-QWN8TJ8
VITE_PUBLIC_SITE_URL=https://companyos.jabali.studio
```

### Do NOT set

```env
VITE_ALLOW_MOCK=1
VITE_API_URL=
```

If `VITE_ALLOW_MOCK` exists on Render, **delete it** and redeploy.

## Deploy steps

1. Open [Render Dashboard](https://dashboard.render.com) → service **company-os** / **loop-web**
2. **Settings → Environment** → paste the three vars above
3. **Custom domain** → `companyos.jabali.studio` (DNS CNAME to Render)
4. **Remove** `VITE_ALLOW_MOCK` if present
5. **Manual Deploy → Clear build cache & deploy** (or push to `main`)

## After deploy

1. Open https://companyos.jabali.studio
2. Login: `alfred@prodg.studio` / `LoopDemo2026!`
3. Confirm you see real org data (not demo seed-only mock)
4. Messaging still hits Supabase Edge (Telegram primary)

## Repo

- GitHub: https://github.com/PRODG-XYZ/company-os
- Branch: `main`
- Build: `npm ci && npm run build`
- Publish: `dist`
- Blueprint: `render.yaml`

## Architecture

```
Browser → companyos.jabali.studio (Render static SPA)
       → Supabase Auth + Postgres
Telegram → Bot API → Supabase Edge (telegram-webhook)
Cron → Supabase Edge (send-checkin, escalate, reports, …)
```
