# 01 — Architecture

## 1.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | SPA, deployed to Vercel |
| Styling | Tailwind CSS + shadcn/ui | Tokens in `09_UI_PAGES.md` §9.2 |
| State/data | TanStack Query + Zustand | Query for server state, Zustand for UI state only |
| Routing | React Router v6 | Nested layouts per role |
| API | Node 20 + Fastify + TypeScript | REST + OpenAPI 3.1 generated from Zod schemas |
| Validation | Zod everywhere | Single source of truth: schema → types → OpenAPI |
| Database | PostgreSQL 16 | Primary + read replica; RLS enforced |
| ORM/query | Drizzle ORM | Explicit SQL, migration files in repo |
| Queue | BullMQ on Redis | All async work; no `pg_cron` for business logic |
| Scheduler | BullMQ repeatable jobs | Timezone-aware per tenant |
| Object storage | S3-compatible (Cloudflare R2) | Transcripts, generated PDFs |
| Secrets | Cloud KMS + envelope encryption | OAuth tokens never in plaintext |
| LLM | Anthropic Claude API | Tiered routing, see `05_AI_PIPELINE.md` |
| WhatsApp | Meta WhatsApp Business Platform via Twilio | See `06_WHATSAPP.md` |
| Transactional email | Resend (or SES) | Report delivery, invites |
| PDF rendering | Playwright → PDF, from an HTML template | Deterministic, styleable |
| SSO / SCIM | WorkOS (buy, don't build) | See `03_IDENTITY_ACCESS.md` §3.4 |
| Observability | OpenTelemetry → Grafana Cloud; Sentry for errors | |
| Feature flags | Flag table in Postgres, per-tenant | No third-party dependency for gating |

**Why not Supabase for v2:** the v1 spec used Supabase. At enterprise scale the product needs per-tenant database routing (§1.3), a real queue, custom SCIM endpoints, and KMS envelope encryption. A plain Postgres + Fastify + BullMQ stack gives explicit control over all four. Keep Postgres, drop the BaaS layer.

---

## 1.2 Services

Five deployable units. Each scales independently.

| Service | Responsibility |
|---|---|
| `web` | React SPA. No business logic. |
| `api` | Fastify REST API. Auth, CRUD, admin. Never calls an LLM synchronously. |
| `workers` | BullMQ consumers. Ingestion, extraction, check-ins, escalation, reporting. |
| `webhooks` | Isolated ingress for Twilio, Fathom, SCIM, provider webhooks. Signature verification only, then enqueue. Separately deployable so a webhook flood cannot take down the API. |
| `scheduler` | Enqueues time-based work per tenant timezone. Stateless, single replica with a leader lock. |

**Hard rule:** the `api` service never performs an LLM call, an outbound message, or a long-running job in the request path. It enqueues and returns.

---

## 1.3 Tenancy model — bridge (pooled + silo)

Start pooled, support silo from day one. Retrofitting isolation later is a rewrite.

### Pooled (default, all tenants)
All tenants share one database. Isolation enforced by **Postgres Row-Level Security**, not application code.

```sql
-- On every tenant-scoped table:
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments FORCE ROW LEVEL SECURITY;  -- applies to table owner too

CREATE POLICY tenant_isolation ON commitments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

**The four RLS footguns — all four must be handled:**

1. **Table owners and superusers bypass RLS.** The application must connect as a dedicated **non-owner role** (`loop_app`) that has no `BYPASSRLS`. Migrations run as a separate owner role.
2. **`SET` leaks across a transaction-mode connection pooler.** PgBouncer in transaction mode reuses connections. Always use the transaction-local form:
   ```sql
   SELECT set_config('app.current_tenant_id', $1, true);  -- `true` = transaction-scoped
   ```
   Never plain `SET`.
3. **Missing `tenant_id`-leading indexes turn every query into a sequential scan.** `tenant_id` is the **first column of every index** on every tenant-scoped table.
4. **An unset tenant variable must fail closed.** `current_setting('app.current_tenant_id', true)` returns NULL when unset; `tenant_id = NULL` returns no rows. Verify this with a test that runs a query with no tenant set and asserts zero rows — do not assume it.

**Mandatory isolation test suite** (`packages/api/test/isolation.spec.ts`), run in CI on every commit:
- For every tenant-scoped table: seed two tenants, set tenant A's context, assert zero rows of tenant B are visible on `SELECT`, `UPDATE`, `DELETE`.
- Assert a query with no tenant context returns zero rows.
- Assert the app role cannot `SET ROLE` to the owner.
- Fail the build on any violation. This test suite is also the evidence artifact for SOC 2 tenant-isolation controls.

### Silo (enterprise / regulated / data-residency)
A tenant flagged `isolation_tier = 'silo'` gets a **dedicated database** (optionally in a specified region). A `tenant_routing` table in a small shared control-plane database maps `tenant_id → connection string + region`. The API resolves the connection at request time from a cached routing table.

**Design this from the first commit:** all database access goes through a `getTenantDb(tenantId)` helper. No module imports a global `db` singleton. This single discipline is what makes the pooled→silo migration a data move rather than a rewrite.

### Migration path
Pooled → silo is a per-tenant operation: provision DB → replicate rows for that `tenant_id` → verify counts → flip routing → verify → purge from pool. Budget one tenant per week; it is not automated in v1 but the runbook lives in `/docs/runbooks/silo-migration.md`.

---

## 1.4 Queues

All BullMQ, all on Redis, all with explicit concurrency and retry policy.

| Queue | Concurrency | Retry | Purpose |
|---|---|---|---|
| `ingest` | 20 | 5×, exp backoff | Pull transcripts, calendar events, email |
| `extract` | 10 | 3×, exp backoff | LLM commitment extraction |
| `classify` | 30 | 3× | LLM reply classification (fast model) |
| `outbound-whatsapp` | **rate-limited, see below** | 5× | All WhatsApp sends |
| `escalate` | 10 | 3× | Escalation evaluation and dispatch |
| `survey` | 10 | 3× | Survey generation and dispatch |
| `report` | 5 | 3× | Report generation + PDF render + email |
| `housekeeping` | 5 | 2× | Retention purges, token refresh, health checks |

**`outbound-whatsapp` rate limiting is not optional.** Configure BullMQ's limiter to the lesser of: the tenant's current Meta tier daily cap, the tenant's configured per-person daily cap, and a global throughput ceiling of 80 messages/second. A single tenant must never be able to consume the global send budget — enforce a per-tenant token bucket in Redis in addition to the queue limiter.

**Idempotency:** every job carries an `idempotency_key`. Webhook-originated jobs use the provider's message/event ID. The worker checks a Redis `SETNX` on the key with a 7-day TTL before doing any work. Providers retry; this is how the retries stay harmless.

**Dead letter:** after final retry, jobs move to `<queue>-dlq` and raise a Sentry alert with the tenant ID. A `/admin/dlq` internal page lists and allows replay.

---

## 1.5 Environments

| Env | Purpose | Data |
|---|---|---|
| `local` | Development | Seeded synthetic data only. Never a copy of production. |
| `preview` | Per-PR ephemeral | Synthetic |
| `staging` | Pre-release verification | Synthetic + a dedicated ProDG staging tenant |
| `production` | Live | Real |

**No production data ever flows to a lower environment.** This is a SOC 2 control and it is easier to enforce from commit one than to retrofit. Seed scripts generate realistic synthetic transcripts and replies (`packages/shared/seed/`).

---

## 1.6 Repository layout

```
loop/
├── apps/
│   ├── web/                  # React SPA
│   ├── api/                  # Fastify REST API
│   ├── workers/              # BullMQ consumers
│   ├── webhooks/             # Webhook ingress
│   └── scheduler/            # Time-based job enqueuer
├── packages/
│   ├── shared/               # Zod schemas, types, constants, seed data
│   ├── db/                   # Drizzle schema, migrations, RLS policies, tenant router
│   ├── ai/                   # Prompt templates, model router, extraction/classification clients
│   ├── messaging/            # WhatsApp template registry + send client
│   └── ui/                   # Shared React components + design tokens
├── docs/
│   ├── compliance/           # DPIA template, LIA template, sub-processor list, AI policy
│   └── runbooks/             # Incident response, silo migration, DLQ replay
├── docs/DECISIONS.md         # Assumptions log (see 00_START_HERE §0.1)
└── docs/spec/                # This specification
```

---

## 1.7 Environment variables

```
# Core
DATABASE_URL=                        # control-plane / pooled DB, as loop_app role
DATABASE_OWNER_URL=                  # migrations only
REDIS_URL=
APP_BASE_URL=
NODE_ENV=

# Encryption
KMS_KEY_ID=                          # envelope encryption key for OAuth tokens
ENCRYPTION_CONTEXT_SALT=

# AI
ANTHROPIC_API_KEY=
AI_MODEL_FAST=                       # classification tier
AI_MODEL_STANDARD=                   # extraction tier
AI_MODEL_DEEP=                       # report synthesis / ambiguous escalation
AI_MONTHLY_BUDGET_USD=               # global circuit breaker

# Messaging
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
META_WABA_ID=
WHATSAPP_GLOBAL_RATE_LIMIT_PER_SEC=80

# Identity
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_WEBHOOK_SECRET=

# Integrations
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
FATHOM_API_KEY=
FATHOM_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=
REPORT_FROM_ADDRESS=

# Storage
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Observability
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
```
