# 12 — Build Order

Two tracks. **Track A is remediation and is not optional.** Nothing in Track B ships until Track A is green, because building features on the current foundation compounds the false-confidence problem the audit found.

---

## TRACK A — Remediation

### A0 · Stop the bleeding (days, not weeks)
Fix things that are dangerous in any environment reachable from a network.

- [ ] `JWT_ACCESS_SECRET` throws at boot when unset. No fallback anywhere.
- [ ] CORS from an explicit allowlist. Fail closed.
- [ ] Webhook signature verification unconditional in every environment. No secret → 503.
- [ ] Delete `body.tenantId` acceptance on all three webhook routes; add the CI grep.
- [ ] Delete mock password-free sign-in from any build reachable outside `NODE_ENV=test`.
- [ ] Move `can()` into `bindRoute`'s `preHandler`. Every route. Boot assertion for unbound routes.
- [ ] Opt-out writes to Postgres synchronously before enqueuing anything.

**Exit:** `apps/api/test/authz.spec.ts` passes and fails when the `preHandler` is removed. The grep gate is in `ci:gates`.

### A1 · One data plane
- [ ] Stand up Postgres with `packages/db/0001_init.sql`.
- [ ] Rebuild `packages/db/test/isolation.spec.ts` per `06_ENFORCEMENT.md` §6.3 — introspected tables, real cross-tenant SELECT/UPDATE/DELETE assertions, the non-vacuity guard.
- [ ] Rebuild the non-`tenant_id`-leading indexes the audit found.
- [ ] Extend `pnpm check:rls` to assert `FORCE` and index leading columns by introspection.
- [ ] Port Edge Functions to workers, one at a time, each landing with its tests.
- [ ] Replace `store/memory.ts` route by route; each route gains its authorization check in the same commit.
- [ ] Re-point the SPA's `db.*` to an API client. Mock survives only under test, with a bundle assertion.
- [ ] Migrate the ProDG pilot data.
- [ ] Archive `supabase/migrations/`. Delete `memory.ts`, `EngineContext.tsx`, `db.supabase.ts`, `Sidebar.tsx`, `Topbar.tsx`, `StatusBadge`.

**Exit:** `grep -rn "org_id" --include=*.ts --include=*.sql . | grep -v archive/` returns nothing. Isolation suite green and gating merges.

### A2 · Wire the AI defence that already exists
- [ ] Inject a real `complete` into `packages/ai`.
- [ ] Extract worker calls `runReader` → `validate` → persist. Delete the Edge extraction path.
- [ ] Delete `owner_email` from the extraction schema.
- [ ] Add deterministic pre-sanitization before the reader.
- [ ] Add output tripwires and `injection_events` writes.
- [ ] Build `packages/ai/test/injection.spec.ts` with all five cases, each asserting zero outbound actions.

**Exit:** injection suite green and gating merges. No commitment can be created by any path other than reader → validator.

### A3 · Make the legal records real
- [ ] `tenant_compliance` and `users.notice_acknowledged_at` are the only stores; delete all localStorage compliance persistence.
- [ ] `provisioning` tenants blocked from invites, connections, and sends — in middleware.
- [ ] Send eligibility reads the DB-backed notice acknowledgement.
- [ ] Governance exclusions persist to `ingestion_exclusions`.
- [ ] Messaging approval queue persists to `message_approvals`.

**Exit:** `compliance.spec.ts` green. Clearing browser storage changes nothing about what the system will do.

### A4 · Resolve every stub
Work `08_PAGES.md` §8.12 top to bottom. Each row ships working or the affordance is deleted. **No row may stay as a toast.**

**Exit:** grep the SPA for `toast(` in a submit handler and justify every remaining instance in review.

---

## TRACK B — The v3 product

### B1 · Flow model
- [ ] `flow_state` and `flow_events` migration; backfill existing commitments.
- [ ] `workingSecondsBetween` in `packages/shared`; every duration routed through it. `tenant_holidays` table and UI.
- [ ] Cost-of-delay bands, with dependency auto-promotion.
- [ ] `due_date` → `committed_date`; remove `inferred` as a source.
- [ ] Flow-state transitions written from check-ins, UI, and corroboration.

**Exit:** the flow timeline on `/commitments/:id` shows a real item as *N days waiting, M hours working*, and the numbers are defensible.

### B2 · The two new screens
- [ ] `GET /flow/summary`, `/flow/aging`, `/waiting`.
- [ ] Add Recharts. Build `AgingScatter`, waiting bars, flow sparkline.
- [ ] `/flow` replaces `/dashboard`. `/waiting` ships. `/inbox` merges into `/my-work`.
- [ ] `StatusChip`, `WaitingTime`, `CostOfDelayBadge` per `07_DESIGN_SYSTEM.md`.

**Exit:** a manager can answer "what is waiting and on whom" in under 10 seconds without asking anyone.

### B3 · Design system migration
- [ ] Retokenize: brand and status become disjoint sets.
- [ ] Every status renders through `StatusChip` — colour, icon, and label, always.
- [ ] Drop Space Grotesk. Three families, three jobs.
- [ ] Replace every hardcoded hex in pages with tokens.
- [ ] Token test: assert no value appears in both brand and status sets.
- [ ] `axe-core` in CI; colour-vision simulation before any token change.

**Exit:** the palette is legible under deuteranopia simulation and the whole app is readable in greyscale.

### B4 · Coordination modes
- [ ] `coordination_mode` column and `packages/shared/src/coordination.ts` profiles.
- [ ] Every consumer reads the profile: scheduler, aging, escalation, templates, surveys, report.
- [ ] `/onboarding/coordination` and `/settings/coordination`.
- [ ] Vocabulary substitution at render time.
- [ ] Five-mode snapshot test — same fixture, five different outputs.

**Exit:** the same five commitments produce five materially different behaviours.

### B5 · Conversation rebuild
- [ ] New template set from `05_CONVERSATION.md` §5.5, submitted to Meta for approval **early** — this has the longest external lead time in the project.
- [ ] Branching check-in flow with tap options.
- [ ] `unblock_request` before escalation. Expect this to become the most-sent message.
- [ ] Escalation ladder with the stop-after-three rule.
- [ ] `HELP` command, which the audit found missing.
- [ ] `nudge_feedback` collection and `/settings/nudge-quality`.
- [ ] Auto-suspend a trigger below 0.70 precision.

**Exit:** two weeks of internal use with nudge precision above 0.70 and opt-outs at zero.

### B6 · Buffers and fever charts
- [ ] Buffer sizing, both methods, with the method shown in the UI.
- [ ] Chain completion where waiting never advances completion.
- [ ] Zones, trail, `unknown` handling.
- [ ] Project Flow tab.

### B7 · Reporting
- [ ] Server-side PDF via Playwright, hashed and stored.
- [ ] The new section structure, led by where time went.
- [ ] Scoping applied at query time.
- [ ] Email delivery with bounce handling.
- [ ] `no-personal-metrics.spec.ts` walking the report JSON.

### B8 · Corroboration
- [ ] Drive/OneDrive metadata connector.
- [ ] Divergence detection → "Might be stale" in `/review`.
- [ ] Assert in tests that divergence is never stored or shown per person.

---

## Launch checklist — ProDG pilot

**Blockers. Not aspirations.**

**Legal**
- [ ] Loop registered with the Kenya ODPC as a data processor; ProDG as controller if above threshold
- [ ] DPIA completed and stored in `tenant_compliance`
- [ ] Legitimate Interest Assessment documented
- [ ] Employee notice published; every pilot user acknowledged in the database
- [ ] DPA signed; sub-processor list published; AI data-handling policy written
- [ ] Terms state the prohibition on performance-evaluation use

**Security**
- [ ] Isolation suite green and gating merges
- [ ] Injection suite green and gating merges
- [ ] Authz suite green and gating merges
- [ ] OAuth tokens KMS-encrypted; test proves no response body leaks them
- [ ] Every webhook signature-verified; no unsigned path in any environment
- [ ] Zero standing staff access to customer data; support access logged and customer-notified

**Platform**
- [ ] Meta Business verification complete; all templates approved
- [ ] Tier ramp configured — 50 sends/day week 1
- [ ] Google and Microsoft OAuth apps configured with minimal read-only scopes
- [ ] SPF, DKIM, DMARC on the sending domain

**Product**
- [ ] Extraction eval gates passing, zero invented dates
- [ ] Ownership map populated with real ProDG categories and owners
- [ ] Exclusion rules configured and reviewed by ProDG leadership
- [ ] Coordination mode set and confirmed (`mutual_adjustment`)
- [ ] Two weeks of manual-approval check-ins with acceptable quality
- [ ] `messaging_mode` explicitly set; no implicit fallback

**Measurement — do this before launch or the pilot proves nothing**
- [ ] **Baseline captured:** current median time-to-resolution, current median waiting share of item lifetime, current count of manual status meetings per week.

Without that baseline there is no way to show the product worked, and "it feels faster" will not survive contact with a customer's procurement team.

---

## Non-goals for v3

Recorded so nobody relitigates them mid-build.

- Individual performance scores, ratings, or rankings — prohibited by design
- Emotion, mood, or wellbeing inference of any kind
- Voice, video, or biometric processing
- Custom roles beyond the four
- Native mobile apps — the SPA is responsive and WhatsApp is the mobile surface
- Slack or Teams as a *check-in* channel — ingestion sources only
- Self-serve billing
- General-purpose chat on WhatsApp — barred by Meta's terms
- Gantt charts and per-task deadlines as the planning primitive — buffers replace them
- Pie charts, donuts, and gauges

---

## The one-sentence test

Before merging anything, ask: **does this help someone see what is waiting, understand what it costs, or get it moving?**

If not, it is not Loop.
