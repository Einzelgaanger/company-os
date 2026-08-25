# 12 — Build Phases and Launch Checklist

Build in this order. Each phase has **exit criteria** that must pass before the next begins. Do not parallelize across phases — the sequencing exists because later phases depend on earlier ones being trustworthy.

---

## Phase 0 — Foundation

**Scope**
- Monorepo per `01_ARCHITECTURE.md` §1.6; CI (lint, typecheck, test, build).
- Postgres schema from `02_DATA_MODEL.md`, all migrations, **RLS enabled and forced on every tenant table**.
- The tenant isolation test suite (§1.3) — running and green in CI.
- `getTenantDb(tenantId)` router. **No global `db` singleton anywhere in the codebase.**
- Redis + BullMQ with all queues declared, idempotency middleware, DLQ handling.
- Auth: email/password, sessions with refresh rotation and reuse detection, TOTP MFA.
- The `can()` authorization layer with the full matrix from `03_IDENTITY_ACCESS.md` §3.2, plus the boot-time assertion that every route declares a policy.
- Observability: OTel tracing with `tenant_id` on every span, Sentry, structured logs.

**Exit criteria**
- [ ] Isolation suite proves zero cross-tenant reads on every table, including with no tenant context set
- [ ] A route without a declared policy fails at boot
- [ ] A migration adding `tenant_id` without RLS fails CI
- [ ] Trace from an HTTP request to a queued job is reconstructable from one trace ID

---

## Phase 1 — Core loop, meetings only

**Scope**
- Fathom connector: webhook, signature verification, idempotency.
- Exclusion filter engine (`04_INTEGRATIONS.md` §4.5) with the "test a rule" tool.
- `visibility_user_ids` computation and enforcement on every commitment read.
- Extraction pipeline with the **full injection defence architecture** (`05_AI_PIPELINE.md` §5.4) — reader/validator/actor split from the first line of code, not retrofitted.
- Eval harness with the golden dataset and hard gates.
- Pages: `/dashboard`, `/projects`, `/projects/:id`, `/commitments`, `/commitments/:id`, `/review`.
- Org onboarding wizard **including the compliance gate**, which is a blocker.
- Individual onboarding including the transparency notice.

**Exit criteria**
- [ ] A real ProDG meeting transcript produces correct commitments with correct owners
- [ ] Extraction eval gates pass (recall ≥0.85, precision ≥0.90, **zero** invented due dates)
- [ ] **All injection test cases result in zero outbound actions**
- [ ] The visibility test case from `04_INTEGRATIONS.md` §4.5 passes
- [ ] Onboarding cannot complete without the compliance attestation
- [ ] `/review` queue works and confirming an item activates it

**Start in parallel, because lead times are long:** Meta Business verification, WhatsApp number registration, and template submission. These take days to weeks and block Phase 3.

---

## Phase 2 — Calendar and project intelligence

**Scope**
- Google Calendar and Microsoft Calendar connectors, incremental sync via sync tokens/delta.
- Recurring-standup detection.
- Project auto-linking (`04_INTEGRATIONS.md` §4.6).
- Milestones, project progress and health calculation (`08_REPORTING.md` §8.2).
- Connection health monitoring and reconnect flows.

**Exit criteria**
- [ ] Calendar syncs incrementally without full re-scans
- [ ] Progress % matches hand-calculation on 5 seeded projects
- [ ] A broken connection surfaces visibly within 30 minutes
- [ ] Low-confidence progress figures render with the confidence marker

---

## Phase 3 — WhatsApp check-ins

**Scope**
- Template registry, seeded and approved by Meta.
- Outbound pipeline with the full eligibility gate, quota gate, and window check (`06_WHATSAPP.md` §6.3).
- Inbound webhook with signature verification, classification, global commands, open-domain refusal.
- Check-in scheduling — **before the due date** (`05_AI_PIPELINE.md` §5.7).
- WhatsApp opt-in and OTP verification in onboarding.
- Quota, tier, and quality monitoring; auto-throttle at 2%.
- Page: `/settings/messaging`.
- **Run manual-trigger only for the first two weeks of internal use.** A human reviews and approves each send. This validates message quality and timing before anything is automated, and it is the difference between a bot people trust and a bot people mute.

**Exit criteria**
- [ ] Full round trip works: commitment → check-in → reply → status update
- [ ] Reply classification accuracy ≥0.90 on real ProDG replies
- [ ] No message is ever sent to a user without opt-in, verification, and notice acknowledgement
- [ ] Quiet hours and working days respected
- [ ] STOP works immediately and permanently
- [ ] Bundling works when multiple items are due for one person
- [ ] Two weeks of manual-approval operation with an acceptable message-quality rate

---

## Phase 4 — Escalation and enterprise identity

**Scope**
- Ownership map UI with the "test routing" tool.
- Escalation engine: trigger evaluation, routing, context snapshot, multi-level fallback.
- Pages: `/escalations`, `/escalations/:id`.
- SSO (SAML/OIDC) and SCIM via WorkOS.
- Teams, nested reporting, group→role mapping.
- Bulk CSV invite.

**Exit criteria**
- [ ] **The Kayode/SharePoint scenario (`06_WHATSAPP.md` §6.4.2) passes end to end as an automated integration test** — this is the product's core proof
- [ ] Escalation context contains everything the recipient needs to act without asking a question
- [ ] SCIM deprovisioning triggers on `active:false` (not just `DELETE`) and revokes sessions within 5 minutes
- [ ] SCIM handlers are idempotent under a 1,000-event burst with duplicates
- [ ] Manual re-routing rate below 10% on the pilot's real escalations

---

## Phase 5 — Surveys, sentiment, and reporting

**Scope**
- Dynamic survey generation with the topic taxonomy and prohibited-topic classifier.
- Admin approval queue.
- WhatsApp survey flow and `/surveys/current` web fallback.
- Aggregation with the **min-n 5 rule enforced in the database, the query layer, and the UI**.
- Individual sentiment purge on aggregation.
- Weekly report: generation, PDF render, email delivery, recipient scoping.
- Pages: `/surveys`, `/reports`, `/reports/:id`, `/settings/reports`, `/settings/my-data`.

**Exit criteria**
- [ ] A cycle with 4 respondents produces **no** aggregate and shows the suppression message
- [ ] No endpoint, view, or export returns a sentiment value keyed to a user — verified by an automated test that enumerates every API route
- [ ] Individual sentiment labels are NULL after aggregation
- [ ] Weekly PDF generates deterministically and matches the section spec
- [ ] Team-scoped reports contain no data outside that team's scope, verified at the PDF byte level
- [ ] The report footer disclaimer appears on every report
- [ ] `/settings/my-data` shows a person everything Loop holds about them

---

## Phase 6 — Hardening and scale readiness

**Scope**
- Read replica routing for all dashboard and report queries.
- Partitioning on `messages`, `ai_runs`, `audit_log`, `commitment_events`.
- Silo tenant provisioning path and migration runbook.
- Retention enforcement jobs.
- DSR workflow.
- Full audit log UI.
- Support-access controls with customer notification.
- Backup restore drill.

**Exit criteria**
- [ ] No dashboard or report query touches the primary
- [ ] Retention jobs verifiably delete on schedule
- [ ] A per-tenant restore has been rehearsed and timed
- [ ] A silo tenant has been provisioned and migrated in staging
- [ ] Support access to a tenant produces an audit entry and a customer notification

---

## Phase 7 — Email ingestion (gated, do not start early)

**Blocked on:** Google CASA Letter of Assessment in hand (C-5). Do not begin until Phases 1–6 are in production and SOC 2 evidence exists to feed the CASA accelerator.

**Scope:** Gmail and Outlook connectors, incremental sync, exclusion filtering before body fetch, extraction, **body purge after extraction + 7 days**, per-tenant feature flag.

**Exit criteria**
- [ ] CASA Letter of Assessment obtained
- [ ] Email bodies verifiably purged on schedule
- [ ] Every other feature works with the flag off
- [ ] Injection tests re-run and pass against email as a source (email is the highest-risk injection surface)

---

## Launch checklist — ProDG pilot

Nothing in this list is optional. Group A are legal blockers.

**A. Legal and compliance**
- [ ] Loop registered with the Kenya ODPC as a data processor
- [ ] ProDG registered as a data controller (if above threshold)
- [ ] DPIA completed and stored against `tenant_compliance`
- [ ] Legitimate Interest Assessment documented
- [ ] Employee notice published; every pilot user has acknowledged it
- [ ] DPA signed between Loop and ProDG
- [ ] Sub-processor list published
- [ ] AI data-handling policy written
- [ ] Incident response plan written, on-call rotation staffed
- [ ] ToS states the prohibition on performance-evaluation use

**B. Security**
- [ ] Tenant isolation suite green
- [ ] Injection test suite green
- [ ] OAuth tokens KMS-encrypted; verified absent from every API response and log
- [ ] All webhooks signature-verified
- [ ] Rate limits active
- [ ] Zero standing staff access to customer data; support flow tested
- [ ] Dependency scan clean of critical CVEs
- [ ] Penetration test booked (annual thereafter)

**C. Platform**
- [ ] Meta Business verification complete
- [ ] WhatsApp number registered; all templates approved
- [ ] Tier ramp plan configured (50/day week 1)
- [ ] Google OAuth consent screen configured; scopes minimized
- [ ] Microsoft Entra app registered with verified publisher
- [ ] SPF, DKIM, DMARC on the sending domain

**D. Product**
- [ ] All eval gates passing
- [ ] Ownership map populated for ProDG with real categories and owners
- [ ] Exclusion rules configured and reviewed by ProDG leadership
- [ ] Report recipients configured
- [ ] Staged rollout scheduled (pilot group → department → org)
- [ ] Two weeks of manual-approval check-ins completed with acceptable quality
- [ ] Baseline metrics captured **before** launch — current median time-to-resolution and days-blocked, so the improvement is provable rather than asserted

**E. Operations**
- [ ] Alerting configured on all golden metrics
- [ ] Runbooks written: Sev 1, DLQ replay, silo migration, restore
- [ ] Backup restore rehearsed
- [ ] Per-tenant AI budget set
- [ ] Status page live

---

## Explicit non-goals for v2

Do not build these. They are recorded so nobody re-litigates them mid-build.

- Individual performance scores, ratings, rankings, or productivity indices — **prohibited by design** (C-1)
- Emotion, mood, wellbeing, or stress inference of any kind — **prohibited** (C-2)
- Voice, video, or biometric analysis — **prohibited** (C-2)
- Custom/configurable roles beyond the four fixed ones
- Native mobile apps (the web app is responsive; WhatsApp is the mobile surface)
- Slack or Teams as a *check-in* channel (they remain ingestion sources only)
- Self-serve billing and checkout
- General-purpose chat with the WhatsApp assistant — **barred by Meta's terms** (C-6)
- Multi-language UI (WhatsApp templates may be localized; the app stays English in v2)
