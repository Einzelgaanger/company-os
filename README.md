# Loop

Multi-tenant B2B autonomous chief of staff: commitments from meetings, WhatsApp check-ins, escalations, surveys, and leadership reports.

Enterprise Spec v2.0 is implemented as a **pnpm monorepo** (`apps/*`, `packages/*`) plus the existing Vite SPA pilot UI (forest/lime). Live Twilio / Google / WorkOS / Postgres credentials are optional later — the offline scaffold runs without them.

## Quick start (SPA demo)

```bash
pnpm install   # or npm install for the SPA lockfile
npm run dev
```

Open http://localhost:5173 → **Explore the ProDG demo**. With no Supabase env, the app uses the seeded in-browser store.

## Offline enterprise stack

```bash
pnpm install
pnpm ci:gates          # RLS check, tests, AI eval, web build, apps build, typecheck
pnpm dev:api           # Fastify memory API :3001
# Demo API login: alfred@prodg.studio / LoopDemo2026!
node scripts/smoke/offline-api.mjs
```

Optional SPA → API bridge: set `VITE_API_URL=http://127.0.0.1:3001` then sign in (tokens stored for Review / Surveys).

| Path | Role |
|------|------|
| `apps/api` | Fastify + JWT + in-memory store (commitments, review, surveys, SCIM, compliance) |
| `apps/workers` | BullMQ handlers (extract/classify/escalate/survey/report/retention/DLQ) |
| `apps/webhooks` | WhatsApp STOP + Fathom ingest stubs |
| `apps/scheduler` | Leader-locked repeatable crons |
| `packages/shared` | authz, progress, calendar, C-1/C-2 guards, flags |
| `packages/db` | Drizzle schema + RLS migration |
| `packages/ai` | reader/validator/actor + eval gates |
| `packages/messaging` | templates, eligibility, STOP, bundling |

Spec map: `docs/README.md`. Current design: `docs/design/00_OVERHAUL_BRIEF.md`. Assumptions: `docs/DECISIONS.md`. Historical copies: `docs/spec/`, `docs/buildguide/`.

## Connecting live credentials (later)

Wire `.env` for Supabase, Twilio, OAuth, Redis, `DATABASE_URL`. Keep `FEATURE_EMAIL_INGESTION` off until CASA (C-5).
