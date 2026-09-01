# Coolify deployment — Loop (Company OS)

## GitHub

https://github.com/Einzelgaanger/company-os

## Architecture on Coolify

| Component | Where it runs |
|-----------|---------------|
| **Loop web app (SPA)** | Coolify — this Dockerfile |
| **WhatsApp, AI, cron, auth DB** | Supabase (`pkxnfkubgpbdbftvtgvf`) — already live |
| **S3 (reports)** | AWS S3 — credentials from Abdul |

The app is **dockerized for the frontend**. Backend orchestration stays on Supabase Edge Functions (not duplicated in Docker for the pilot).

## Coolify setup

1. New resource → **Docker Compose** or **Dockerfile**
2. Repo: `Einzelgaanger/company-os`, branch `main`
3. Build args / env:

```env
VITE_SUPABASE_URL=https://pkxnfkubgpbdbftvtgvf.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PUBLIC_SITE_URL=https://loop.yourdomain.com
```

4. Do **not** set `VITE_ALLOW_MOCK`
5. Port **80** (nginx)

## Compose file

```bash
docker compose -f docker-compose.coolify.yml up -d --build
```

## S3 (Abdul's bucket)

Add to Supabase Edge secrets or `.env`:

```env
S3_BUCKET=<bucket name>
S3_REGION=eu-north-1
S3_ACCESS_KEY_ID=<from onetimesecret>
S3_SECRET_ACCESS_KEY=<from onetimesecret>
```

## Full monorepo stack (optional)

```bash
docker compose -f docker-compose.coolify.yml --profile full-stack up -d
```

Requires separate Dockerfiles for `@loop/api`, workers — not required for ProDG pilot.
