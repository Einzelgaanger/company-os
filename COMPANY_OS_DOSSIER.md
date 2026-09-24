# Company OS — Technical Due-Diligence Dossier

**Generated from repository inspection (read code + measured metrics).**  
**Product names in repo:** Company OS (current brand), Loop / ProDG OS (legacy).  
**Evidence tags:** `[BUILT]` end-to-end wired · `[PARTIAL]` incomplete/stubbed/dual-path · `[PLANNED]` docs/TODOs/empty · `[UNCLEAR]` cannot determine from code.

**Scope note:** This dossier describes what the **codebase** implements. Customer counts, revenue, and pilot outcomes are **not** in the repo and appear in §17.

---

## 1. Executive summary

### One sentence

Company OS is an org-scoped work-coordination system that turns meetings and chat into owned **commitments**, then follows up on Telegram/WhatsApp and escalates blockers with context to the right person.

### One paragraph

The repository is a **pnpm monorepo** with a React/Vite SPA (`src/`), fifteen **Supabase Edge Functions** (production messaging, extraction, reports, OAuth), and a parallel **Fastify + BullMQ + Postgres** stack (`apps/*`, `packages/*`) that is substantially implemented in code but largely an offline/demo second plane. The live product path documented in `docs/ops/RENDER.md` and `render.yaml` is: **static SPA on Render + Supabase Auth/Postgres/Edge**. Core loops that exist in Edge code: Fathom/chat → ingest → LLM extraction → review queue; cron check-ins → outbound Telegram/WhatsApp; inbound reply classification → optional escalate; daily/weekly leadership reports with LLM theme summaries. A rich SPA demo seed models **ProDG Studios**. Dual schemas (`org_id` archive vs `tenant_id` packages/db) are a real architectural debt.

### Problem the code reveals

The product assumes work fails not because tasks are unknown, but because **commitments go stale without context**: owners are not pinged, blockers stay private, and leaders get noise without a frozen escalation snapshot. Code centers on `commitments` + `checkins` + `escalations` + ownership routing (`supabase/functions/escalate/index.ts`, `send-checkin/index.ts`) rather than generic task boards.

### Five most impressive technical things (with evidence)

1. **End-to-end commitment extraction with confidence + review gate** — Edge LLM classifies meeting type, requires source quotes, resolves owners by email/fuzzy name, inserts rows with `needs_review` when confidence &lt; 0.7. `[BUILT]` `supabase/functions/extract-commitments/index.ts` (`REVIEW_THRESHOLD`, `SYSTEM`, `PROMPT`, `resolveUser`).
2. **Sensitivity-aware escalation with redaction** — Escalation builds a context snapshot and redacts description/check-ins if recipient clearance &lt; commitment sensitivity. `[BUILT]` `governContext` / `routeTarget` in `supabase/functions/escalate/index.ts`.
3. **Telegram-first inbound loop with account linking** — Webhook links chat IDs via phone (`LINK` / `/start`), dedupes, classifies replies with LLM, can trigger escalate. `[BUILT]` `supabase/functions/telegram-webhook/index.ts`, `supabase/functions/_shared/inboundReply.ts`.
4. **FORCE RLS tenant schema (target plane)** — `packages/db/migrations` enables **FORCE ROW LEVEL SECURITY** and fail-closed `nullif` on empty tenant setting. `[BUILT]` `packages/db/migrations/0001_init.sql`, `0006_rls_nullif.sql`; isolation tests in `packages/db/test/isolation.spec.ts`.
5. **Hardened extraction package (second AI stack)** — Versioned prompt, closed Zod schema, injection tripwires, OpenRouter completion, evals. `[BUILT]` `packages/ai/src/prompts/extract_commitments/v1.ts`, `pipeline.ts`, `complete.ts`, `packages/ai/evals/`.

---

## 2. Product: what a user can actually do today

### User-facing capabilities

| Capability | Tag | Evidence |
|------------|-----|----------|
| Marketing site / brand landing | `[BUILT]` | `src/pages/MarketingHome.tsx`, routes in `src/App.tsx` |
| Email/password auth (Supabase) | `[BUILT]` | `src/context/AuthContext.tsx`, login/signup pages |
| Google OAuth via Supabase | `[BUILT]` | `signInWithGoogle` → `signInWithOAuth` + `/auth/callback` (`AuthContext.tsx`, `AuthCallback.tsx`, `GoogleOAuthButton.tsx`) |
| Forgot / reset password | `[BUILT]` | `ForgotPassword.tsx`, `ResetPassword.tsx` (needs Supabase) |
| Org onboarding wizard | `[BUILT]` | `/onboarding/*` pages + `RequireOnboarding` (`guards.tsx`) |
| Compliance attestation UI | `[PARTIAL]` | `onboarding/Compliance.tsx` prefers Fastify `api` when `VITE_API_URL`; Edge/SPA path via launch settings |
| Flow dashboard (working vs waiting) | `[PARTIAL]` | `src/pages/app/Flow.tsx` + `flowData.ts` — API flow endpoints if Fastify; else mock/db aggregates |
| My Work / commitments list & detail | `[BUILT]` | `MyWork.tsx`, `Commitments.tsx`, `CommitmentDetail.tsx` + `db.supabase.ts` / mock |
| Create / update / mark done commitments (web) | `[BUILT]` | `db.supabase.ts` `createCommitment`, `updateCommitment`, `markCommitmentDone` |
| Manager review queue (approve/reject AI items) | `[PARTIAL]` | `ReviewQueue.tsx` — Supabase `needs_review` path **and** Fastify `/review` |
| Projects / team / escalations / notifications | `[BUILT]` | Pages under `src/pages/app/*` wired to `db.*` |
| Reports list & detail | `[PARTIAL]` | SPA reads `reports`; generation via Edge `generate-report` or Fastify `/reports/generate` |
| Surveys | `[PARTIAL]` | SPA + Fastify survey routes; Edge does not run survey cycles |
| Integrations UI (connect calendar etc.) | `[PARTIAL]` | `Integrations.tsx` + Edge `oauth` / Fastify connections |
| Settings: org, people, ownership map, messaging, launch readiness | `[PARTIAL]` | `Settings*.tsx`; launch status uses Edge `launch-readiness` when Supabase configured (`SettingsLaunch.tsx`, `src/lib/launch.ts`) |
| Telegram check-ins & replies | `[BUILT]` (ops-dependent) | Edge send + webhook; requires bot token + linked users |
| WhatsApp check-ins & replies | `[BUILT]` (ops-dependent) | Meta/Twilio via `_shared/whatsapp.ts` |
| Fathom meeting → commitments | `[BUILT]` (ops-dependent) | `fathom-webhook` → `ingest-meeting` → `extract-commitments` |
| Calendar sync into DB | `[BUILT]` (ops-dependent) | `sync-calendar` + cron in `0010_cron_calendar.sql` |
| In-app autonomy / browser engine | `[PARTIAL]` | Browser `EngineContext` **removed**; mock `src/lib/engine.ts` remains; `AutonomyPill.tsx` ties to Fastify sweeps |
| Billing | `[PARTIAL]` | Settings billing UI; Stripe env names exist; no confirmed live billing flow in SPA |
| WorkOS SSO / SCIM | `[PARTIAL]` | Edge `workos-webhook`; Fastify SSO/SCIM routes; needs secrets |
| Email ingestion of commitments | `[PLANNED]` | Webhooks return 501 unless `FEATURE_EMAIL_INGESTION` (`apps/webhooks`) |

### Roles and permissions (as implemented)

Roles enum: **`owner | admin | manager | member`** — `src/lib/types.ts`, archive schema check constraint in `supabase/archive/migrations/0001_schema.sql`.

| Product language | Code |
|------------------|------|
| Leadership | Not a role; manager+ / admin views and report recipients |
| Manager | `manager` — review queue, team, reports routes gated `RequireRole min="manager"` |
| Staff | `member` |
| Admin | `admin` (+ `owner` for billing / highest clearance) |

Visibility: `scopedUserIds` / `visibleCommitments` / `canAccess` in `src/lib/data/db.mock.ts` (re-exported via `src/lib/db.ts`) — admin sees org; manager sees self + reports; sensitivity vs `clearanceFor(role)`.

API: `apps/api/src/app.ts` binds routes to permission actions via `@loop/shared` authz.

### Channels

| Channel | Read | Send | Auth / identity | Tag |
|---------|------|------|-----------------|-----|
| **Web dashboard** | Commitments, projects, escalations, reports, settings | CRUD via Supabase client or Fastify | Supabase Auth / Fastify JWT / mock | `[BUILT]` |
| **Telegram** | Inbound text replies; LINK by phone | Outbound check-ins, escalations, digests via `sendOutbound` | Bot token; `telegram_chat_id` on users (`0011_telegram.sql`) | `[BUILT]` |
| **WhatsApp** | Meta/Twilio webhooks | Same templates / outbound | Phone on user; Meta/Twilio secrets | `[BUILT]` |
| **Email** | Report delivery (`_shared/email.ts`); OAuth email providers gated | Reports; OTP templates | Resend etc. via secrets | `[PARTIAL]` |
| **Calendar** | Google/Microsoft events → `calendar_events` | Write not primary | OAuth `oauth` Edge fn | `[BUILT]` |
| **Meetings / Fathom** | Transcripts via webhook + ingest | N/A | Webhook secret / endpoints table | `[BUILT]` |
| **Slack/Teams/Zoom chat** | Text stub → optional extract | N/A | `chat-webhook` + endpoints | `[PARTIAL]` |

---

## 3. Core concepts and data model

### Entities (product language → tables)

| Concept | Archive (Edge/SPA live) | Target (`packages/db`) |
|---------|-------------------------|------------------------|
| Organisation | `organizations` | `tenants` |
| User | `users` (+ `auth.users`) | `users` |
| Commitment | `commitments` | `commitments` (+ flow columns) |
| Check-in / message | `checkins` | `messages` / `conversations` |
| Escalation | `escalations` | `escalations` |
| Ownership map | `ownership_map` | `ownership_map` |
| Meeting | `meetings` | `meetings` |
| Project | `projects` | `projects` |
| Report | `reports` | `reports` + deliveries |
| Connection | `connections` | `connections` |
| Notification | `notifications` | (audit / notifications patterns) |

### Schema summary — archive (what Edge uses today)

Source: `supabase/archive/migrations/0001_schema.sql` (+ later migrations).

Key `commitments` fields (0001): `org_id`, `project_id`, `title`, `description`, `owner_id`, `requested_by_id`, `source`, `source_meeting_id`, `due_date`, `priority`, `status` ∈ open/in_progress/at_risk/overdue/escalated/done, `confidence_score`, `needs_review`, `sensitivity`, `last_checkin_at`, `resolved_at`.

RLS: `0002_rls.sql` — `org_id = auth_org_id()` patterns (not FORCE RLS).

Telegram: `0011_telegram.sql` adds `telegram_chat_id`, `telegram_username`, `telegram_linked_at` on `users`.

Production infra: `0009_production_infra.sql` — `phone_otp_codes`, `calendar_events`, webhook endpoint tables; `0008_app_secrets.sql` — service-role secret store.

### Schema summary — packages/db (40 tables, FORCE RLS)

`packages/db/migrations/0001_init.sql` through `0006_rls_nullif.sql`: tenants, users, projects, commitments, flow_events, meetings, messaging, approvals, surveys, reports, ai_runs, audit_log, dsr_requests, etc. Tenant isolation via `set_config('app.current_tenant_id')` + FORCE RLS.

### Commitment lifecycle (who owes what to whom by when)

**Representation:** Row in `commitments` with `owner_id` (owes), `requested_by_id` (to whom), `due_date`, `title`/`description`, `status`, optional `source_meeting_id`.

**Create paths:**
1. LLM extraction → insert (`extract-commitments/index.ts`).
2. SPA `createCommitment` (`db.supabase.ts`).
3. Fastify POST `/commitments` (`apps/api/src/routes/commitments.ts`) — memory or Postgres.
4. Demo seed (`src/lib/data/seed.ts`).

**Update / close:** SPA updates + status history; inbound LLM sets parsed status and may mark done/escalate; `markCommitmentDone`.

**Review:** Low confidence → `needs_review`; managers confirm/reject in UI or Fastify `/review/:id/confirm|reject`.

### ER diagram (archive / Edge plane — simplified)

```mermaid
erDiagram
  organizations ||--o{ users : has
  organizations ||--o{ projects : has
  organizations ||--o{ commitments : has
  organizations ||--o{ meetings : has
  organizations ||--o{ escalations : has
  organizations ||--o{ checkins : has
  organizations ||--o{ reports : has
  organizations ||--o{ ownership_map : has
  users ||--o{ commitments : owns
  users ||--o{ commitments : requests
  users ||--o{ checkins : sends
  meetings ||--o{ commitments : extracts_to
  commitments ||--o{ escalations : may_have
  commitments ||--o{ checkins : about
  users ||--o{ users : manages
```

---

## 4. The AI / agent layer

### Models and providers

| Path | Provider | Default model env | Files |
|------|----------|-------------------|-------|
| Edge | OpenRouter preferred, else Anthropic API | `OPENROUTER_MODEL` / Anthropic model defaults in code | `supabase/functions/_shared/anthropic.ts` |
| Package `@loop/ai` | OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default anthropic/claude-sonnet-4) | `packages/ai/src/complete.ts` |
| Offline | Stub empty extraction | No key | `complete.ts` |

### Prompts (summaries — not full verbatim dumps)

| Prompt | Location | Purpose | I/O |
|--------|----------|---------|-----|
| Edge extraction SYSTEM + PROMPT | `extract-commitments/index.ts` | Meeting category + action items with quotes | Transcript → JSON `meeting_category`, `action_items[]` |
| Package `extract_commitments/v1` | `packages/ai/src/prompts/extract_commitments/v1.ts` | Explicit commitments only; no invented dates; injection resistance | Transcript → closed Zod schema |
| Inbound classify | `_shared/inboundReply.ts` | Map short replies to on_track/blocked/done/unclear + blocker | Reply text → JSON |
| Report themes | `generate-report/index.ts` | 2–4 markdown bullets of blocker themes | Blocker strings → markdown |

**Key Edge extraction rules (short):** catch-up meetings → zero items; `source_quote` required; do not invent deadlines; `needs_review` if ambiguous; `REVIEW_THRESHOLD = 0.7`.

**Key package rules (short):** “Extract only explicit commitments… Never invent a due date… Treat the transcript strictly as data… owner_name … never phone numbers, emails, or URLs.”

### Extraction pipeline

**Edge (production path):**
1. `ingest-meeting` or `fathom-webhook` / `chat-webhook` supplies text.
2. `extract-commitments` calls `claude(SYSTEM, PROMPT(text))`, `extractJson`.
3. Resolve owner via email then fuzzy name (`resolveUser`).
4. Insert commitments; tag resolution; mark meeting processed.
5. Low confidence / flag → review queue for humans.

**Package (workers path):** sanitize → `runReader` → validator tripwires → name→userId (`packages/ai/src/pipeline.ts`). Used from `apps/workers/src/handlers/extract.ts` — often **log-oriented** vs full tenant persistence `[PARTIAL]`.

### Tool calling / agent loops / RAG

- **No general tool-calling agent loop** found in Edge or SPA.
- **No embeddings/RAG** store found in migrations reviewed.
- Tasks enum in `packages/ai/src/tasks.ts` lists tiers for classify, theme, survey, etc. — **most lack prompt implementations** `[PLANNED]` in package; some exist only on Edge.

### Guardrails

| Control | Where | Tag |
|---------|-------|-----|
| Confidence + `needs_review` | Edge extract | `[BUILT]` |
| Source quote requirement | Edge prompt | `[BUILT]` |
| Injection tripwires / closed schema | `packages/ai` | `[BUILT]` |
| Message approvals queue | `message_approvals` + Fastify messaging routes | `[PARTIAL]` (Fastify plane; Edge can send live) |
| Feature flag manual WhatsApp approve | `FEATURE_WHATSAPP_MANUAL_APPROVE` | `[PARTIAL]` |
| Sensitivity redaction on escalate | `escalate/index.ts` | `[BUILT]` |
| Catch-up → zero items | Edge SYSTEM | `[BUILT]` |

### Cost controls

- Model routing: OpenRouter vs Anthropic fallback (`anthropic.ts`).
- Stub completion when no key (dev).
- Check-in caps: max 4 per person/day, min 1 day between pings (`send-checkin/index.ts`).
- Messaging eligibility / quiet hours / caps in `packages/messaging/src/eligibility.ts` (Fastify plane).
- `ai_runs` table in packages/db for telemetry `[PARTIAL]` usage in live Edge unclear.

---

## 5. Automations and scheduling

### Follow-ups before / after due

`send-checkin` (hourly cron intended): selects commitments in open/in_progress/at_risk/overdue with owner; sends if **overdue** or **stale** (&gt;2 days since `last_checkin_at`); skips prefs off, daily cap 4, &lt;1 day since last ping; template `W-FOLLOWUP` (`templates.ts`). `[BUILT]`

### Escalation ladder

`escalate/index.ts` `routeTarget`:
1. Match `ownership_map` category against title/description/tags (or `default`).
2. If primary has open escalation, use backup.
3. Else requester’s `manager_id`.
4. Else any admin/owner.
SLA hours from map or 24. Idempotent if open escalation exists. Notifies via outbound + in-app notification. Also invoked from inbound blocked replies. `[BUILT]`

Scheduled sweep: cron `*/30 * * * *` → `escalate` (`0006_cron.sql`).

### Leadership reports

`generate-report`: daily/weekly bounds; counts open/overdue/resolved/escalations; LLM themes from blockers; markdown body; insert `reports`; email recipients from `org.settings.report_recipient_ids`; optional PDF/S3. Cron daily 06:00 (`0006_cron.sql`). `[BUILT]`

### Digest

`send-digest` — morning digest outbound (`0006_cron.sql` hourly invoke). `[BUILT]`

### Cron / queues / webhooks (schedules)

| Mechanism | Schedule / trigger | Target | Tag |
|-----------|-------------------|--------|-----|
| pg_cron `loop-send-checkin` | `0 * * * *` | Edge `send-checkin` | `[BUILT]` in migration; **live cron depends on Supabase project config** `[UNCLEAR]` if currently enabled |
| `loop-escalate-sweep` | `*/30 * * * *` | Edge `escalate` | same |
| `loop-generate-report-daily` | `0 6 * * *` | Edge `generate-report` | same |
| `loop-send-digest` | `0 * * * *` | Edge `send-digest` | same |
| `loop-retention-purge` | `30 2 * * *` | SQL purge | same |
| `loop-sync-calendar` | `0 * * * *` | Edge `sync-calendar` | `0010_cron_calendar.sql` |
| BullMQ scheduler | 7 jobs (5–30 min / daily) | workers queues | `[BUILT]` registration; `[PARTIAL]` side effects |
| Telegram/WhatsApp/Fathom/OAuth webhooks | HTTP | Edge fns | `[BUILT]` |

---

## 6. Integrations

| Integration | Purpose | R/W | Auth | Tag | Paths |
|-------------|---------|-----|------|-----|-------|
| Supabase Auth | Login, OAuth, session | R/W | JWT | `[BUILT]` | `src/lib/supabase.ts`, AuthContext |
| Supabase Postgres | Data plane | R/W | RLS + service role | `[BUILT]` | Edge + `db.supabase.ts` |
| OpenRouter / Anthropic | LLM | W (API) | API keys in Edge secrets | `[BUILT]` | `_shared/anthropic.ts`, `packages/ai` |
| Telegram Bot API | Primary messaging | R/W | Bot token | `[BUILT]` | `_shared/telegram.ts`, telegram-webhook |
| Meta WhatsApp Cloud | Messaging | R/W | App tokens | `[BUILT]` | `_shared/metaWhatsApp.ts`, whatsapp-webhook |
| Twilio WhatsApp | Messaging fallback | R/W | Account SID/token | `[BUILT]` | `_shared` + `packages/messaging/twilio.ts` |
| Fathom | Meeting transcripts | R | Webhook secret | `[BUILT]` | fathom-webhook, ingest-meeting |
| Google Calendar | Sync events | R | OAuth | `[BUILT]` | oauth, sync-calendar |
| Microsoft Calendar | Sync events | R | OAuth | `[BUILT]` | oauth, sync-calendar |
| Slack/Teams/Zoom chat | Text ingest stub | R | Webhook endpoints | `[PARTIAL]` | chat-webhook |
| WorkOS | SSO / directory | R/W | API key / webhook | `[PARTIAL]` | workos-webhook, Fastify SSO |
| Resend / email | Report & OTP mail | W | API key | `[PARTIAL]` | `_shared/email.ts` |
| S3-compatible storage | Report PDFs | W | Keys | `[PARTIAL]` | `_shared/s3.ts` |
| Stripe | Billing | — | Secrets in env example | `[PLANNED]` / `[UNCLEAR]` | env names only; no full SPA charge flow verified |
| Render | Host SPA | — | Dashboard | `[BUILT]` config | `render.yaml` |
| Redis / BullMQ | Optional monorepo jobs | — | `REDIS_URL` | `[PARTIAL]` | apps/scheduler, workers |

---

## 7. Architecture

### Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18, Vite, React Router, Tailwind, Radix (`package.json`, `src/`) |
| Production backend | Supabase Edge Functions (Deno) + Supabase Postgres |
| Optional backend | Fastify (`apps/api`), BullMQ workers, webhook server, scheduler |
| Shared libs | `@loop/shared`, `@loop/db`, `@loop/ai`, `@loop/messaging` |
| Auth | Supabase Auth (prod SPA); JWT sessions (Fastify) |
| Hosting | Render static (`runtime: static` in `render.yaml`); Supabase cloud |
| Queues | BullMQ+Redis (optional); pg_cron+pg_net (Supabase) |

### System diagram

```mermaid
flowchart LR
  User[Browser SPA] --> Render[Render static]
  User --> SBAuth[Supabase Auth]
  User --> SBDB[(Supabase Postgres)]
  TG[Telegram] --> TW[telegram-webhook]
  WA[WhatsApp] --> WW[whatsapp-webhook]
  Fathom[Fathom] --> FW[fathom-webhook]
  FW --> IM[ingest-meeting]
  IM --> EX[extract-commitments]
  EX --> SBDB
  Cron[pg_cron] --> SC[send-checkin]
  Cron --> ES[escalate]
  Cron --> GR[generate-report]
  SC --> TG
  SC --> WA
  TW --> IR[inboundReply LLM]
  WW --> IR
  IR --> ES
  GR --> Email[Email/S3]
  Optional[Fastify+Workers+Redis] -.-> SBDB
```

### Sequence diagrams

#### a. Meeting ends → commitments extracted

```mermaid
sequenceDiagram
  participant Fathom
  participant FW as fathom-webhook
  participant IM as ingest-meeting
  participant EX as extract-commitments
  participant LLM as OpenRouter/Anthropic
  participant DB as Postgres
  Fathom->>FW: signed transcript webhook
  FW->>IM: forward meeting payload
  IM->>DB: insert meetings
  IM->>EX: POST text + org_id
  EX->>LLM: SYSTEM + PROMPT
  LLM-->>EX: JSON action_items
  EX->>DB: resolve owners, insert commitments
  Note over EX,DB: needs_review if confidence low
```

#### b. Owner follow-up before/after deadline

```mermaid
sequenceDiagram
  participant Cron as pg_cron
  participant SC as send-checkin
  participant DB as Postgres
  participant Out as Telegram/WhatsApp
  Cron->>SC: hourly invoke
  SC->>DB: due/stale commitments
  SC->>Out: W-FOLLOWUP template
  SC->>DB: checkins + last_checkin_at
```

#### c. Missed / blocked → escalate

```mermaid
sequenceDiagram
  participant User as Owner on Telegram
  participant TW as telegram-webhook
  participant IR as inboundReply
  participant LLM as LLM classify
  participant ES as escalate
  participant DB as Postgres
  participant Mgr as Manager channel
  User->>TW: "blocked waiting on X"
  TW->>IR: processInboundTelegram
  IR->>LLM: classify reply
  LLM-->>IR: blocked + blocker
  IR->>ES: escalate commitment
  ES->>DB: ownership_map route + snapshot
  ES->>Mgr: W-ESCALATE outbound
```

#### d. Leadership weekly report

```mermaid
sequenceDiagram
  participant Cron as pg_cron
  participant GR as generate-report
  participant DB as Postgres
  participant LLM as theme summary
  participant Mail as email
  Cron->>GR: daily/weekly
  GR->>DB: commitments, escalations, blockers
  GR->>LLM: summarise themes
  GR->>DB: insert reports
  GR->>Mail: recipients from org.settings
```

#### e. Telegram update / query commitment

```mermaid
sequenceDiagram
  participant U as User
  participant Bot as Telegram
  participant TW as telegram-webhook
  participant IR as inboundReply
  participant DB as Postgres
  U->>Bot: LINK phone / status reply
  Bot->>TW: update
  alt link
    TW->>IR: match LINK
    IR->>DB: set telegram_chat_id
  else status
    IR->>DB: find open commitment context
    IR->>IR: LLM classify
    IR->>DB: update checkins / status
  end
```

**Note:** Free-form “query any commitment by search” is **not** a dedicated NLP tools agent; inbound is reply-classification oriented `[PARTIAL]` for general Q&A.

### Multi-tenancy

**Yes, multi-org by design:** every archive table is `org_id`-scoped; packages/db uses `tenant_id` + FORCE RLS. SPA resolves org from authenticated user. Edge uses service role but filters by `org_id` in queries.  
**Caveat:** Dual planes (`org_id` vs `tenant_id`) mean Edge and Fastify are **not** one database contract today (`docs/design/01_CONSOLIDATION.md` referenced by exploration).

---

## 8. Security, privacy and reliability

| Area | Finding | Tag |
|------|---------|-----|
| Auth | Supabase Auth; Fastify JWT + sessions map | `[BUILT]` / `[PARTIAL]` (in-memory sessions) |
| Authorisation | Role gates SPA; RLS archive; FORCE RLS target; API policy binds | `[BUILT]` |
| Secrets | Edge `app_secrets` + env; never commit values | `[BUILT]` pattern |
| Token storage | `connections` tokens; encryption helpers / KMS env names | `[PARTIAL]` |
| Governance | Sensitivity levels + escalation redaction; tags classification | `[BUILT]` |
| Webhook verify | Telegram secret, Meta/Twilio signatures, Fathom | `[BUILT]` |
| Idempotency | Inbound dedupe by provider message id on `checkins`; worker idempotency helpers | `[BUILT]` / `[PARTIAL]` |
| Rate limits | Check-in daily caps; messaging eligibility | `[BUILT]` |
| Monitoring | Sentry DSN env name; no strong in-app APM verified | `[PARTIAL]` |
| Logging | `audit` helpers; audit_log tables | `[PARTIAL]` |

### Known weak spots (honest)

1. **Two data planes** — Edge on archive `org_id` schema; packages/db `tenant_id` FORCE RLS not yet the Edge target.
2. **Two AI extraction stacks** with different rules (email allowed on Edge, forbidden in package schema).
3. **SPA production requires build-time Vite env** — missing vars blank the app (`src/lib/db.ts`, `main.tsx`).
4. **Fastify workers often fixture/stub** — scheduler ticks may not persist real tenant work.
5. **Email ingestion 501** by default.
6. **Git history shallow** — only **10** commits on `main` (likely squash/import); contribution signal weak for diligence.
7. **Live cron enablement** cannot be confirmed from repo alone.

---

## 9. Deployment and operations

### Production path (documented + config)

- **SPA:** Render static — `render.yaml` (`npm ci && npm run build`, publish `dist`).
- **Production site:** `https://os.jabali.studio` (Render SPA). Also `*.onrender.com` service naming in infra.
- **Backend:** Supabase project ref name appears in config files as hostname form `*.supabase.co` (no secrets copied here).
- **Confirm live users/traffic:** **cannot** from code alone. Deploy configs **suggest** intent to be live; ops scripts (`scripts/ops/*`, `smoke:prod`) exist.

### Local run (high level)

1. `npm`/`pnpm` install at root.
2. Copy `.env.example` → `.env` (names only — fill locally).
3. SPA: `npm run dev` / `pnpm dev` (Vite `:5173`).
4. Optional: `pnpm db:up` (Docker Postgres+Redis), `pnpm db:migrate`, `pnpm dev:api`.
5. Optional workers/webhooks/scheduler scripts in `package.json`.
6. Supabase functions: deploy via Supabase CLI/Dashboard (ops scripts under `scripts/ops/`).

### Env var **names** (purpose only — from `.env.example`)

**Vite/SPA:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_SITE_URL`, `VITE_ALLOW_MOCK`, `VITE_API_URL`  
**Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `PUBLIC_APP_URL`  
**Fastify:** `JWT_ACCESS_SECRET`, `CORS_ORIGINS`, `DATABASE_URL`, `DATABASE_OWNER_URL`, `REDIS_URL`, `APP_BASE_URL`, `API_PUBLIC_URL`, `TOKEN_ENCRYPTION_KEY`, `KMS_KEY_ID`  
**Messaging:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_TELEGRAM_WEBHOOK_URL`, Meta/Twilio WhatsApp vars, `MESSAGING_MODE`, feature flags  
**OAuth:** `GOOGLE_OAUTH_*`, `MICROSOFT_OAUTH_*`, `WORKOS_*`  
**AI:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`  
**Other:** `FATHOM_*`, `RESEND_API_KEY`, `S3_*`, `SENTRY_DSN`, `STRIPE_*`

### CI

`package.json` `ci:gates` — RLS checks, no-body-tenant, no-org-id drift check, tokens check, vitest, package tests, AI eval, builds, typecheck. GitHub workflow may be deferred (historical commit message mentions CI deferral) `[UNCLEAR]` current Actions status.

---

## 10. Evidence of real usage

| Signal | What code shows |
|--------|-----------------|
| Demo org seed | **ProDG Studios** (`org-prodg`, slug `prodg-studios`) in `src/lib/data/seed.ts` — **demo data**, not proof of production tenancy |
| Production URLs | Docs/ops point at jabali.studio hosts and Render |
| Smoke scripts | `scripts/smoke/prod.mjs`, WhatsApp readiness |
| Customer list / MRR / MAU | **Not in repository** |

### Metrics the founder can run (Supabase SQL — archive schema)

```sql
-- Organisations
select count(*) from organizations;

-- Users
select count(*) from users where status = 'active';

-- Commitments tracked
select count(*) from commitments;
select status, count(*) from commitments group by 1;

-- Follow-ups sent (outbound checkins)
select count(*) from checkins where direction = 'outbound';

-- Escalations
select count(*) from escalations;
select status, count(*) from escalations group by 1;

-- Reports
select type, count(*) from reports group by 1;

-- Message volume (7d)
select count(*) from checkins where created_at > now() - interval '7 days';

-- Active users (approx: users with checkin or last_active in 7d)
select count(distinct user_id) from checkins where created_at > now() - interval '7 days';
```

(Adjust if production already migrated to `packages/db` table names — **verify live schema first**.)

---

## 11. Metrics sheet (measured)

Commands used (PowerShell / git from repo root):

```text
git log --reverse --format='%ai' | Select-Object -First 1
git log -1 --format='%ai'
git rev-list --count HEAD
git shortlog -sn --all
git log --format='%ad' --date=format:'%Y-%m' | Group-Object
Get-ChildItem -Recurse -Filter *.ts|*.tsx|... (line counts)
Select-String apps/api/src/routes/*.ts 'app.(get|post|...)'
Get-ChildItem supabase/functions -Directory
Get-ChildItem **/*.{test,spec}.{ts,tsx}
```

| Metric | Value |
|--------|------:|
| First commit (this clone) | 2026-08-25 |
| Latest commit | 2026-09-22 |
| Total commits on HEAD | **10** |
| Commits Aug 2026 | 4 |
| Commits Sep 2026 | 6 |
| Human contributors (shortlog) | **1** (`Einzelgaanger`) + Dependabot |
| LOC `.ts` | 28,821 (207 files) |
| LOC `.tsx` | 14,607 (129 files) |
| LOC `.sql` | 2,312 (19 files) |
| LOC `.mjs` | 2,144 (26 files) |
| LOC `.css` | 2,169 (3 files) |
| LOC `.js` | 185 (3 files) |
| **Sum measured source LOC** | **~50,238** (excl. `.md`; md ~12k in prior pass) |
| Fastify `app.(get|post|…)` in routes | **55** |
| Edge function packages | **15** |
| Test/spec files | **25** |
| Live migration CREATE TABLE (packages/db) | **~40** (per migration inventory) |
| Archive CREATE TABLE | **~23** |
| Versioned prompt files | **1** (+ Edge inline prompts) |
| LLM-calling Edge entrypoints | **4** direct (+ 3 chain to extract) |
| BullMQ scheduler jobs | **7** |
| TODO/FIXME in ts/tsx (rg) | **0** matches (debt often undocumented) |
| Test pass status this run | **Not executed** in this diligence pass |

---

## 12. Build quality assessment

### Praise

- Clear product ontology (commitment / check-in / escalation / ownership map).
- Serious compliance thinking: RLS FORCE, sensitivity redaction, DSR tables, notice ack, messaging eligibility.
- Versioned AI prompt + evals in `@loop/ai`.
- Dual-path honesty in docs (Render+Supabase vs Fastify offline).
- Substantial UI surface with role guards and onboarding.

### Criticise

- **Architectural split** unfinished — highest diligence risk.
- Worker/scheduler **demo fixtures** vs production Edge automation duplication.
- Thin git history for claimed build size (squash?).
- Some SPA features still Fastify-oriented while prod SPA is Supabase-first.
- Vocabulary mismatch across stacks (reply statuses, org_id vs tenant_id).

---

## 13. Gaps and roadmap evidence

### Themes of incompleteness

| Theme | Evidence | Tag |
|-------|----------|-----|
| Schema consolidation | Archive README / consolidation docs; Edge still `org_id` | `[PLANNED]` |
| Email ingest | 501 feature flag | `[PLANNED]` |
| Browser autonomy removed | EngineContext gone; server sweeps partial | `[PARTIAL]` |
| AI task types without prompts | `packages/ai/src/tasks.ts` | `[PLANNED]` |
| SettingsCoordination unrouted | file exists, not in `App.tsx` | `[PLANNED]` |
| Stripe billing | env only | `[PLANNED]` |
| Chat webhooks text-only | `chat-webhook` | `[PARTIAL]` |
| WorkOS default org required | workos-webhook | `[PARTIAL]` |

### Ten high-leverage next features (from code trajectory)

1. Unify Edge on `packages/db` tenant schema (or generate Edge from one schema).
2. Single extraction pipeline (merge Edge + `@loop/ai` rules).
3. Prove pg_cron live + observability dashboard.
4. Telegram deep-link onboarding without manual phone LINK friction.
5. Human approval default for first outbound messages in new orgs.
6. Waiting-board nudge actions (SPA comments defer them).
7. Real worker persistence for extract/classify/outbound.
8. Email/meeting provider breadth beyond Fathom.
9. Survey cycles end-to-end on Edge or retire Fastify-only surveys.
10. Production metrics Birk / founder SQL pack in-app.

---

## 14. What makes it different (built only)

Versus **Asana/Notion/Linear:** those are pull-based boards. Company OS **pushes** status collection on messaging channels and **escalates with a frozen context snapshot** to a routed owner (`escalate/index.ts`), not just assignee fields.

Versus **Otter/Fireflies/Fathom alone:** those deliver transcripts/notes. Company OS **classifies meeting type, extracts owed commitments with quotes, gates low confidence for humans, then operates the commitment** through check-ins and escalations (`extract-commitments`, `send-checkin`, messaging webhooks).

**Telegram/WhatsApp-first** is not a notification sidecar — inbound classification updates work state (`inboundReply.ts`).

---

## 15. Funding-application fact sheet

### Copy-ready facts

1. Company OS is a React/Vite SPA with Supabase Auth for production login `[BUILT]` (`src/context/AuthContext.tsx`, `src/lib/supabase.ts`).
2. Production hosting config is Render static + Supabase `[BUILT]` (`render.yaml`, `docs/ops/RENDER.md`).
3. Fifteen Supabase Edge Functions implement messaging, extraction, reports, OAuth, calendar `[BUILT]` (`supabase/functions/*/index.ts`).
4. Commitments are first-class DB entities with owner, requester, due date, status, sensitivity, confidence `[BUILT]` (`0001_schema.sql`).
5. LLM extracts commitments from transcripts with source quotes and review thresholds `[BUILT]` (`extract-commitments/index.ts`).
6. Catch-up meetings are instructed to yield zero action items `[BUILT]` (SYSTEM prompt in extract-commitments).
7. Fathom webhooks can ingest meetings into extraction `[BUILT]` (`fathom-webhook`, `ingest-meeting`).
8. Hourly check-in automation targets overdue/stale commitments `[BUILT]` (`send-checkin/index.ts`, `0006_cron.sql`).
9. Telegram bot webhook links users by phone and processes status replies `[BUILT]` (`telegram-webhook`, `inboundReply.ts`).
10. WhatsApp inbound shares the same classification pipeline `[BUILT]` (`whatsapp-webhook`, `inboundReply.ts`).
11. Escalations route via ownership map with sensitivity redaction `[BUILT]` (`escalate/index.ts`).
12. Daily/weekly leadership reports include LLM blocker themes `[BUILT]` (`generate-report/index.ts`).
13. Roles owner/admin/manager/member gate SPA routes `[BUILT]` (`src/lib/types.ts`, `App.tsx` guards).
14. A parallel Fastify API exposes ~55 HTTP route registrations `[PARTIAL]` (`apps/api/src/routes/*`).
15. Target Postgres schema uses FORCE RLS per tenant `[BUILT]` (`packages/db/migrations/0001_init.sql`).
16. Messaging eligibility enforces opt-in, quiet hours, caps `[BUILT]` (`packages/messaging/src/eligibility.ts`).
17. AI package includes injection tests and evals `[BUILT]` (`packages/ai/test/injection.spec.ts`, `evals/`).
18. Google OAuth button and callback route exist for Supabase `[BUILT]` (`GoogleOAuthButton.tsx`, `AuthCallback.tsx`).
19. Demo seed models organisation **ProDG Studios** `[BUILT]` (`src/lib/data/seed.ts`) — demo, not customer proof.
20. Calendar sync Edge function + cron migration exist `[BUILT]` (`sync-calendar`, `0010_cron_calendar.sql`).
21. Manual WhatsApp approval and email ingestion are feature-flagged / incomplete `[PARTIAL]`/`[PLANNED]`.
22. Measured ~50k LOC of ts/tsx/sql/css/mjs in-tree (excl. node_modules) `[BUILT]` measurement §11.
23. Test corpus includes 25 `*.test.ts` / `*.spec.ts` files `[BUILT]` file count.
24. Multi-tenant org_id scoping is present on core archive tables `[BUILT]` (`0001_schema.sql`).
25. Dual-stack consolidation remains unfinished `[PARTIAL]` (Edge vs packages/db).

### Descriptions (BUILT-only)

**1 sentence:** Company OS extracts work commitments from meetings, follows up on Telegram/WhatsApp, and escalates blockers with context to the right owner.

**~50 words:** Company OS is an agentic chief-of-staff product: it turns meeting transcripts into owned commitments with confidence review, pings people on Telegram or WhatsApp when work goes stale, classifies replies, escalates blocked work through an ownership map with sensitivity controls, and sends leadership summaries with recurring blocker themes.

**~150 words:** Company OS (evolved from Loop / ProDG OS) is software for keeping organisational commitments alive after meetings end. A React app on Render talks to Supabase for auth and data. Edge Functions ingest Fathom meetings, call an LLM to extract concrete commitments with source quotes and confidence scores, and park ambiguous items for manager review. Scheduled jobs message owners on Telegram or WhatsApp when items are due or stale, log check-ins, and classify inbound replies to update status or trigger escalation. Escalations route using an ownership map and can redact sensitive context for lower-clearance recipients. Leadership reports aggregate overdue and escalated work and summarise blocker themes. Roles (owner, admin, manager, member) gate the web console. A second Fastify/workers stack and hardened AI package exist in-repo for a Postgres/FORCE-RLS future, but the documented live path is Supabase Edge plus the SPA.

---

## 16. Demo script (3 minutes — BUILT surfaces)

**Prep:** Production or local SPA with Supabase configured; at least one commitment; optional Telegram linked user.

| Time | Step | Show |
|------|------|------|
| 0:00–0:20 | Open marketing → Login | Brand, Google/email login |
| 0:20–0:50 | Land on Flow / My Work | Commitments list, statuses |
| 0:50–1:20 | Open a commitment detail | Owner, requester, due, sensitivity |
| 1:20–1:50 | Review queue (manager) | `needs_review` item approve/reject |
| 1:50–2:20 | Escalations page | Open escalation + context |
| 2:20–2:45 | Settings → Launch readiness | Telegram/Meta/OAuth evidence flags |
| 2:45–3:00 | (Optional) Telegram reply “blocked …” | Status update / escalate path if live |

### Screenshots worth capturing

1. Marketing hero (Company OS).
2. Login with Google button.
3. Flow / waiting board.
4. Commitment detail with source/review badges.
5. Review queue.
6. Escalation detail with context snapshot.
7. Reports markdown view.
8. Launch readiness settings.
9. Telegram chat thread with check-in + reply (if live).
10. Architecture diagram from this dossier (for appendix).

---

## 17. Questions for the founder

1. How many **real** organisations and seats are live on Supabase (not ProDG seed)?
2. What is pilot NPS / hours saved / escalation resolution time?
3. Revenue, pricing, and contractual status?
4. Is pg_cron actually enabled on the production Supabase project?
5. Is Telegram or WhatsApp the primary channel in the pilot, and message volumes?
6. Why does git show only ~10 commits — was history rewritten?
7. Timeline and owner for consolidating Edge onto `packages/db`?
8. Which extraction stack is canonical going forward?
9. Any design partners beyond ProDG naming in seed?
10. Team size / full-time vs contractors; months of calendar effort?
11. Competitive losses/wins vs Asana + Fireflies bundles seen in sales calls?
12. Regulatory posture: ODPC / Meta Business verification status (code tracks fields, not approvals)?
13. Data residency / subprocessors list for investors?
14. Runway and use of funds if fellowship/accelerator capital arrives?
15. Demo account credentials policy for reviewers (separate from any committed secrets)?

---

## Appendix A — Repo map (depth ≤3, excludes node_modules/dist/.git)

```text
apps/           api, scheduler, webhooks, workers
packages/       ai, db, messaging, shared
src/            Vite SPA (components, context, lib, pages)
supabase/       functions/, archive/migrations/, archive/deferred|manual
docs/           ops, design, spec, audit, compliance, research
scripts/        checks, ops, seed, smoke
public/         static assets
docker/         nginx, postgres
render.yaml, Dockerfile, docker-compose*.yml, pnpm-workspace.yaml
```

## Appendix B — Evidence discipline

- No API keys, tokens, phone numbers, or personal emails copied into this file.
- Production domain names listed as hostnames only.
- Organisation name **ProDG Studios** appears in seed/config as demo.
- Where runtime enablement (cron, secrets present, real tenants) cannot be proven from the repo, tagged `[UNCLEAR]` or listed under founder questions.

---

*End of dossier.*
