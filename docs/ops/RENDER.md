# Company OS production — Render SPA + Supabase

**This is the production hosting path.** Coolify is deferred.

| Piece | Where |
|-------|--------|
| **Web app (SPA)** | `https://os.jabali.studio` (Render + custom domain; service `company-os-cce2`) |
| **Auth, DB, Telegram (+ WhatsApp fallback), AI, cron** | Supabase — `pkxnfkubgpbdbftvtgvf` |

## Render Dashboard → Environment

Set these **build-time** env vars (Vite bakes them into the JS — runtime-only env does nothing):

```env
VITE_SUPABASE_URL=https://pkxnfkubgpbdbftvtgvf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBreG5ma3ViZ3BiZGJmdHZ0Z3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MTQzMjIsImV4cCI6MjEwMTM5MDMyMn0.58gAIN2dpUWjMqCdBK4AEoo1LqT79cNNRv9-QWN8TJ8
VITE_PUBLIC_SITE_URL=https://os.jabali.studio
```

### Do NOT set (delete if present)

```env
VITE_ALLOW_MOCK=1
VITE_API_URL=http://127.0.0.1:3001
```

| Symptom | Cause |
|---------|--------|
| Blank page / *Production build requires VITE_SUPABASE…* | `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` missing at **build** |
| *Cannot reach the API at http://127.0.0.1:3001…* | `VITE_API_URL` set to localhost — delete it |

After any env change: **Manual Deploy → Clear build cache & deploy**.

## Deploy steps

1. Open [Render Dashboard](https://dashboard.render.com) → service **company-os** / **company-os-cce2**
2. **Environment** → set the three `VITE_*` vars above (anon key is required; blueprint marks it `sync: false`)
3. **Custom domain** → `os.jabali.studio` (DNS CNAME to Render)
4. **Remove** `VITE_ALLOW_MOCK` and `VITE_API_URL` if present
5. **Manual Deploy → Clear build cache & deploy**

## After deploy

1. Open https://os.jabali.studio — page should load (not blank)
2. View source / Network → JS bundle should contain `pkxnfkubgpbdbftvtgvf.supabase.co`
3. Login with a real Supabase user
4. Messaging hits Supabase Edge (Telegram primary)

## Repo

- GitHub: https://github.com/PRODG-XYZ/company-os
- Branch: `main`
- Build: `npm ci && npm run build`
- Publish: `dist`
- Blueprint: `render.yaml`

## Architecture

```
Browser → os.jabali.studio (Render static SPA)
       → Supabase Auth + Postgres
Telegram → Bot API → Supabase Edge (telegram-webhook)
Cron → Supabase Edge (send-checkin, escalate, reports, …)
```
