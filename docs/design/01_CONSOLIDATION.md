# 01 — Consolidation

## 1.1 The decision

**Keep one plane: Postgres with `tenant_id`, forced RLS, accessed only through `getTenantDb()`.**

The audit found two data planes — Supabase with `org_id` and an unused Drizzle schema with `tenant_id` — plus a third de-facto plane in `localStorage`, plus a fourth in the Fastify in-memory `Map`. Four sources of truth is not a migration in progress. It is a system with no source of truth.

**Why the `packages/db` plane wins:**
- It already has `FORCE ROW LEVEL SECURITY` and the correct transaction-scoped `set_config('app.current_tenant_id', $1, true)` (`packages/db/src/tenant.ts:80-82`). The Supabase plane has `ENABLE` without `FORCE`, which means the table owner bypasses it.
- It supports the pooled→silo path that enterprise customers will require.
- Its tenant context comes from a verified token, not from a `users` row lookup — the Supabase `auth_org_id()` helper adds a query to every policy evaluation.

**What happens to Supabase:** Auth stays (it is good and it is working). PostgREST as a data path goes. Edge Functions become ordinary workers in `apps/workers`. `supabase/migrations/` copies live under `supabase/archive/migrations/` with a README explaining they are frozen, not live.

**What happens to the SPA's `db.*` adapter layer:** it becomes a thin typed API client against `@loop/api`. The mock adapter survives **only** as a test double behind `NODE_ENV=test`, never reachable in a deployed build. Add a build-time assertion that fails the production bundle if the mock module is reachable from the entry graph.

---

## 1.2 Target architecture

| Layer | Choice | Note |
|---|---|---|
| Frontend | The existing Vite SPA, kept | It is the furthest-along asset. Do not rebuild it. Re-point it. |
| API | Fastify, `apps/api`, backed by Postgres | Delete `store/memory.ts` |
| Auth | Supabase Auth for identity; Loop issues its own session JWT carrying `tid` and `role` | Keeps a working piece; puts tenant claims under Loop's control |
| Data | Postgres 16, `packages/db`, forced RLS | Single plane |
| Queue | BullMQ on Redis, `apps/workers` | Already scaffolded correctly |
| Webhooks | `apps/webhooks` | Already correct except tenant resolution — see §1.4 |
| Scheduler | `apps/scheduler` | Add per-tenant timezone — see §1.5 |
| AI | `packages/ai`, wired to a real client | The reader/validator/actor split already exists and is correct. It just needs `complete` injected. |
| Messaging | `packages/messaging` + Twilio | Eligibility logic already correct and tested |

**No new frameworks.** Every piece above already exists in the repo. This is a consolidation, not a rewrite. The work is deletion and wiring, which is why it is achievable.

---

## 1.3 Killing the browser engine

`src/context/EngineContext.tsx` runs a 60-second interval that performs check-in, escalation, and digest sweeps in the user's browser. Delete it.

Reasons, in order of severity:
1. It only runs while a tab is open, so autonomy silently depends on someone being logged in.
2. Two open tabs run it twice.
3. It duplicates logic that must also exist server-side, guaranteeing eventual divergence between what the demo does and what production does.
4. It cannot be audited — there is no server-side record of a decision made in a browser.

**Replacement:** the sweeps move to `apps/scheduler` (they are already scaffolded there). The SPA keeps a **read-only** `AutonomyPill` that shows when the last server sweep ran and when the next is due, plus a "Run a sweep now" button for admins that calls `POST /admin/sweeps/run` and is rate-limited to once per five minutes per tenant.

---

## 1.4 Fixing tenant resolution on webhooks

Current: `tenantId: body.tenantId ?? null` (`apps/webhooks/src/index.ts:79,103,148`). A caller who knows a tenant ID can write into that tenant.

**Replacement, per provider:**

| Provider | How tenant is resolved |
|---|---|
| Twilio / WhatsApp | Look up the **recipient** WhatsApp number (`To`) in `messaging_numbers` → tenant. Then look up the **sender** number (`From`) in `users.phone_e164` scoped to that tenant. If the sender does not resolve within that tenant, drop the message and log. Never search across tenants. |
| Fathom | Each tenant registers its own webhook with a tenant-scoped secret path: `/webhooks/fathom/:webhookId`. `webhookId` is a random opaque value stored on `connections`. The tenant comes from the row, and the HMAC secret is the row's secret. |
| Email (later) | Same pattern: per-tenant webhook ID in the path. |

**Rule:** tenant is derived from a credential or a registered identifier that the sender could not have guessed, never from a field in a JSON body. Add the CI grep from `00_OVERHAUL_BRIEF.md` §0.3.

**Signature verification becomes unconditional.** The current code allows unsigned bodies when no secret is set and `NODE_ENV !== 'production'`. Replace with: no secret configured → the endpoint returns 503 and logs a configuration error. There is no unsigned path in any environment. Development uses a dev secret in `.env.example`.

---

## 1.5 Timezone

`tenant_settings.timezone` exists (default `Africa/Nairobi`) and the scheduler does not read it. All seven repeatable jobs run on server time.

**Fix:** the scheduler enqueues per tenant, not globally. Each tick reads the tenant's timezone, working days, and quiet hours, and computes whether that tenant is due. A tenant in Nairobi and a tenant in London must not receive check-ins at the same UTC instant.

Concretely: the repeatable job becomes `tenant-tick` running every 15 minutes, which fans out one job per active tenant with that tenant's local time attached. Cheap, correct, and it removes the seven separate global crons.

---

## 1.6 Migration path

Do this in order. Do not start §1.7 until §1.6 is done.

1. **Freeze the Supabase data plane.** Stop writing new features against PostgREST.
2. **Bring `packages/db` up.** Run `0001_init.sql` against a real Postgres. Verify RLS with the real isolation test from `06_ENFORCEMENT.md` §6.3 — it must fail when you disable a policy.
3. **Port the Edge Functions to workers.** `extract-commitments`, `whatsapp-webhook`, `send-checkin`, `escalate`, `generate-report`. The logic transfers; the client changes from a service-role Supabase client to `getTenantDb(tenantId)`.
4. **Replace `store/memory.ts` route by route.** Each route moves to `getTenantDb()` and gains its middleware authorization check in the same commit.
5. **Re-point the SPA.** `src/lib/db.ts` becomes an API client. Delete `db.supabase.ts`. Keep the mock only under test.
6. **Migrate the pilot data.** ProDG's seeded org moves from Supabase to Postgres with a one-off script. Small dataset, one-time.
7. **Archive.** Move `supabase/migrations/` to `archive/`. Delete `apps/api/src/store/memory.ts`. Delete `EngineContext.tsx`.

**Exit criterion for the whole of §1.6:** grep the repository for `org_id` and find zero matches outside `archive/`.

---

## 1.7 Repository layout after consolidation

```
loop/
├── apps/
│   ├── api/              Fastify. Postgres only. No memory store.
│   ├── workers/          BullMQ consumers. Real DB writes.
│   ├── webhooks/         Per-tenant webhook IDs. Unconditional signature checks.
│   └── scheduler/        Per-tenant tick fan-out.
├── packages/
│   ├── db/               THE schema. Drizzle + 0001_init.sql + tenant router.
│   ├── shared/           authz, flow math, coordination modes, progress, calendar.
│   ├── ai/               reader/validator/actor + prompts + evals. Now wired.
│   ├── messaging/        templates, eligibility, opt-in.
│   └── ui/               design tokens + shared components.
├── src/                  The SPA. Kept. Re-pointed.
├── archive/
│   └── supabase-migrations/   Frozen. README explains why.
├── docs/compliance/
├── docs/runbooks/
└── loop-v3/              This specification.
```

---

## 1.8 Configuration hygiene

Fixes for specific audit findings:

| Finding | Fix |
|---|---|
| `JWT_ACCESS_SECRET` falls back to `dev-access-secret-change-me` | Throw at boot if unset. No fallback in any environment. |
| CORS `origin: true` | Explicit allowlist from `ALLOWED_ORIGINS`, comma-separated. Fail closed. |
| Drizzle-kit connects as `loop`, runtime as `loop_app` | Two roles is correct — `loop_app` must not own the tables or RLS is bypassable. Rename the migration role to `loop_migrator` and document the split in `packages/db/README.md`. |
| Hardcoded Supabase project ref in `0006_cron.sql` | Deleted with the cron file. |
| Demo credentials in source (`memory.ts:49`, `AuthContext.tsx:172-175`) | Deleted with the memory store. Demo data comes from `pnpm seed:demo` against a real database, with credentials from env. |
| MFA secret `LOOPDEMO2FASECRET` in source | Deleted. Real TOTP or the page does not ship. |
| Missing migration `0003` | Irrelevant after archiving, but note it in the archive README so nobody hunts for it later. |
