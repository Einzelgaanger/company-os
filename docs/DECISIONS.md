# Decisions

Small implementation assumptions made where the spec left room, per Section 0. Each line has a one-line rationale.

## Loop v3 design overhaul (2026-08)

- **`docs/design/` supersedes `docs/spec/` and `docs/buildguide/`.** Track A must exit green before Track B. Rationale: overhaul brief is the locked product/security source of truth.
- **A0 fail-closed:** `JWT_ACCESS_SECRET` + `CORS_ORIGINS` required at boot; webhook missing secret → 503; no `body.tenantId`; `requireBoundAction` middleware; password-free demo login killed outside DEV/test; `pnpm check:no-body-tenant` in `ci:gates`.
- **Default data plane (A1):** local/CI Postgres 16 + `packages/db` FORCE RLS. PostgREST/Edge as SPA data path is frozen/archived.
- **Brand vs status tokens disjoint (B3):** lime decorative only; primary forest; status on blue→orange axis.
- **Launch blockers (not claimed done):** Kenya ODPC, Meta verification, CASA, live Twilio/WorkOS OAuth — `docs/design/11_BUILD_ORDER.md`.

## Enterprise Build Spec v2.0 (2026-08) — historical notes

- **Monorepo alongside existing SPA.** `apps/{api,workers,webhooks,scheduler}` + `packages/{shared,db,ai,messaging}`; root Vite app remains until cutover.
- **Performance record feature never built** (C-1). No individual sentiment API/UI (C-2).
- **Gmail/email ingestion deferred** behind `email_ingestion` flag (C-5).
- **WhatsApp STOP** persists opt-out before enqueue; eligibility fails on `whatsapp_opted_out`.
- **CI gates:** `pnpm ci:gates` = RLS + no-body-tenant + package tests + AI eval + web/apps build + typecheck.
- **API memory store** transitional through A1; demo `alfred@prodg.studio` / `LoopDemo2026!`.

## Architecture / data layer

- **Local mock backend for demo.** When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent, the frontend runs against a seeded in-browser store (`src/lib/data/store.ts`, `src/lib/data/seed.ts`) that mirrors the Supabase schema. This lets the ProDG pilot click through a fully working app before any backend is provisioned. Rationale: the spec ships env vars as a Phase-1 prerequisite; the mock keeps the app runnable and demoable in the meantime, and the `db` module (`src/lib/db.ts`) exposes the same async surface a Supabase adapter will implement.
- **Data-access module (`src/lib/db.ts`).** All pages call typed functions here instead of touching the store directly, so swapping in PostgREST/Supabase calls later is a single-file change. Rationale: keeps UI decoupled from persistence.
- **Mock auth.** Sign-in requires `LoopDemo2026!` (A0). DEV-only credential prefill; no password-free Explore button in production. Google sign-in remains a toast stub until OAuth.

## Onboarding / auth

- **Invite token = invited user's row id** in mock mode (`/invite/:token`). Rationale: no separate invites table was specified; invited `users` rows (`status = 'invited'`) already model a pending invite.
- **Onboarding completion** is tracked per-user in `localStorage` (`loop.onboarded.<uid>`). Rationale: the spec routes "first login" users through onboarding but defines no persisted flag; seeded/demo users are treated as onboarded.
- **OTP is shown as a demo hint** on the WhatsApp verify screen in mock mode. Rationale: no Twilio in the browser; the real code is delivered via the `verify-otp` function + `W-OTP` template.

## Scoping / RBAC

- **"Team" scope = direct reports** via `users.manager_id` (one level), matching the spec's "team's" wording. Rationale: spec says `manager_id` defines the reporting line; multi-level rollups noted as a later enhancement.
- **RLS uses `SECURITY DEFINER` helper functions** (`auth_org_id()`, `auth_role()`, `auth_manages()`) instead of reading `org_id` from a JWT claim. Rationale: avoids requiring a custom auth hook to populate claims and prevents recursive RLS on `users`; one policy per role per table as required by Section 3.

## UI

- **shadcn-style primitives** are hand-included under `src/components/ui` (Radix + CVA), themed only via the Section 11 tokens. Rationale: keeps the dependency surface small and the tokens authoritative.
- **Toasts** use a lightweight context provider rather than the full Radix Toast, but the API (`useToast`) and copy match the Copy Deck. Rationale: simpler, same UX.
- **Loop motif** appears exactly twice (dashboard empty state, onboarding ring) as instructed; also reused at small size on the positive Escalations empty state, which is conceptually the same "nothing to see" moment.
- **PDF export** uses the browser print dialog (`window.print()`). Rationale: no server-side PDF renderer in v1.

## Backend (Edge Functions)

- Functions under `supabase/functions/*` are written for Deno per the spec and implement Sections 8.1–8.6, 10, and 13 (Twilio signature validation, idempotency on `external_id`/Twilio SID, read-only OAuth scopes, service-role writes to `audit_log`). They are not exercised by the mock frontend; they run once a Supabase project + provider credentials are configured.
- **`extract-commitments` retry-once then needs-review** on malformed LLM JSON (Section 14): the meeting is stored with `processed_at` null.
- **Reports email/WhatsApp delivery** creates in-app notifications and sets `sent_at`; the actual mailer/Twilio digest send is left as a clearly-marked integration point.

## Data governance & tagging

- **Four-level sensitivity model** (`public < internal < confidential < restricted`) plus org-scoped **tags** (each with a default classification and a `pii` flag). Rationale: an industry-standard classification ladder that maps cleanly to access rules and retention; tags carry the domain taxonomy (client data, financials, pii, hr, legal, engineering, credentials).
- **Clearance = role**: member → internal, manager → confidential, admin/owner → restricted. **Need-to-know overrides clearance**: a commitment's owner or requester can always see their own item regardless of level. Enforced in the app (`canAccess`, `visibleCommitments`) and in RLS (`0004_governance.sql` folds a `sensitivity_rank <= auth_clearance()` check into `commitments_select`).
- **Auto-classification on ingest**: `db.createCommitment` runs a shared heuristic (`src/lib/classify.ts`) when no sensitivity is supplied, so nothing enters untagged; the `extract-commitments` edge function does the same via Claude (returns `sensitivity` + `tags`, auto-creating tags). Users can override via the Classify dialog (`classified_by` tracks provenance: `system` vs `user`).
- **Data-access log**: sensitive-item views/exports/reclassifications are recorded (`data_access_log`) and surfaced in Governance → Access log. To keep the trail signal-rich, low-sensitivity `view`s are not logged.
- **Governance-aware context sharing**: when the engine (or the `escalate` function) shares context with an escalation recipient below the data's clearance, free-text fields (description, messages, blockers) are redacted with a governance notice while the escalation is still routed. This is the "share context, but govern it" guarantee.
- **Governance module** (`/governance`, manager+): coverage %, classification distribution, "needs classification" queue, policy violations (e.g. confidential data owned by an external party), tag management (admin+), and the access log.

## Autonomous engine

- **Client-side engine** (`src/lib/engine.ts` + `EngineProvider`) runs sweeps on a 45s interval (and once ~1.2s after load) whenever `org.settings.autonomy_enabled`. It mirrors the edge-function logic so the running app demonstrably "runs itself" without requiring Twilio/cron. Rationale: the frontend uses the mock store; this makes autonomy visible and testable now, with the same behavior deployed server-side later.
- **Sweeps**: `checkinSweep` (first-touch progress ping on commitments idle past `checkin_stale_hours`, default 48h), `nudgeSweep` (follow-up after `nudge_after_hours`, default 24h, if unanswered), `escalateSweep` (route via ownership map by tag/category, escalate overdue or post-nudge-stalled items with a governed context snapshot). Each sweep is idempotent per tick (skips items with a pending outbound / already-open escalation).
- **Channel fallback**: check-ins go to WhatsApp when the owner's phone is verified, otherwise in-app (surfaced in **My check-ins**, `/inbox`), where owners reply and Loop classifies the response (`classifyResponse`) and advances the commitment (done → resolved, blocked → at_risk, on track → in_progress).
- **Autonomy control** lives in the topbar pill (status, last-run summary, run-now, pause/resume) and persists to `org.settings`.

## Borrowed from DANI (action-item quality — not a merge)

- **Keep Loop separate.** DANI remains the RAG/meeting-intelligence product. Loop borrows validated *execution* patterns only. See `docs/research/BORROW_FROM_DANI.md`.
- **Meeting classification** on extract (`catch_up` → skip items; other categories extract). Stored on `meetings.category`.
- **Confidence + review queue**: `commitments.confidence_score`, `needs_review`, `source_quote`. Threshold default `0.7` (`org.settings.review_confidence_threshold`). UI at `/review`.
- **Dependencies / feedback / status history** tables mirror DANI's ActionItemDependency, Feedback, History — channel-aware (`ui|whatsapp|api|system|engine`).
- **Daily digest** (`send-digest` edge + engine `digestSweep`): overdue / due today / upcoming / no due. Opt-out via `notification_prefs.daily_digest`.
- **Recency guard** on outbound check-ins (`outbound_max_age_hours`, default 168h) — lesson from DANI's Jul-2 email blast.
- **Richer inbound NL**: done / blocked / snooze (sets `snoozed_until`) via `classifyResponse`.
- **Explicitly not borrowed**: RAG chat, Qdrant, ghostwriter, infographics, deal Kanban, contacts CRM.

## Non-goals honored (Section 15)

No native mobile, custom roles, multi-language, self-serve billing, or Slack/Teams as a nudge channel. Phase 7 (email/calendar/Drive beyond meetings) is scaffolded (OAuth function + provider cards) but not built out.

## Real Supabase backend (wired)

- When `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, `db` uses `db.supabase.ts` and Auth uses Supabase Auth. Mock store remains as fallback when env vars are absent.
- **Org bootstrap** is a `SECURITY DEFINER` RPC (`bootstrap_organization`) because there is no client INSERT policy on `organizations` and `users.org_id` is NOT NULL. Invites use an `invites` table + `accept_invite` RPC (auth user must match invite email).
- **Autonomy in real mode**: topbar "Run now" invokes Edge Functions `send-checkin` + `escalate`. Server schedule is `0006_cron.sql` (pg_cron → `invoke_edge`). Twilio is optional — without it, check-ins still write as `in_app` + notifications.
- Cron auth: `invoke_edge` reads Vault secret `loop_service_role_key` (set once in SQL Editor). Without it, scheduled jobs no-op with a notice.
- Demo login against real DB: `npm run seed:demo` → `alfred@prodg.studio` / `LoopDemo2026!`.
- Manual SQL fallback if CLI account lacks project access: `supabase/archive/manual/push_0005_0006.sql`.
