# LOOP v3 — PRODUCT OVERHAUL

**Supersedes:** `docs/spec/` (v2) and `docs/buildguide/` entirely. Where this document and any earlier spec disagree, this document wins.
**Written against:** the forensic audit dated 2026-08-24.
**Audience:** Cursor, and any engineer joining the project.

---

## 0.1 Why there is an overhaul

The audit found roughly 35–45% of the intended product built, with almost all of it in the clickable SPA and almost none in the production spine. That is not the reason for the overhaul. Missing code gets written.

The overhaul exists because of two findings that are not about completion:

**One: the product is the wrong shape.** v2 specified a commitment tracker with a nag bot attached. Everything the operations literature says about why work is slow points somewhere else: the cost is not in tasks, it is in **queues** — work that has started and is now waiting. Loop was measuring the wrong object. This changes the data model, the hero screen, the check-in questions, and the report.

**Two: almost every control in v2 was declared rather than enforced.** The audit is a list of this failure mode:

| v2 declared | Audit found |
|---|---|
| Role-based authorization via `can()` | `bindRoute` registers action names and boot-fails if unbound, but handlers never call `can()`. Any authenticated role can mutate commitments and the review queue. |
| Tenant isolation via forced RLS | Pilot Supabase has `ENABLE` without `FORCE`. The enterprise schema has `FORCE` and correct transaction-scoped `set_config`, but nothing writes to it. |
| Proof of isolation in CI | Live tests assert `expect(hasDb).toBe(true)` and never execute a cross-tenant `SELECT`. |
| Tenant derived server-side | Webhooks accept `body.tenantId ?? null` from the client. |
| Compliance gate blocks onboarding (C-3) | Attestation and notice acknowledgement persist to `localStorage`. Clearing browser storage clears the legal record. |
| Opt-in required before any message (C-6) | Eligibility logic is correct and tested, but the STOP ledger is an in-memory `Map` and the worker never persists. A restart re-enables messaging to someone who opted out. |
| Reader/validator/actor injection split (C-4) | `@loop/ai` implements it correctly and **is never called**. The live Edge path interpolates raw transcript text with no sanitization. |

A control that exists in a policy file and not in the request path is not a control. **This overhaul's single most important rule is at §0.3.**

---

## 0.2 What Loop is, restated

> Loop makes waiting visible, and shortens it.

Not a task tracker. Not a status-report generator. Not a performance system. An instrument that answers three questions continuously, for any organization:

1. **What is waiting, and on whom?**
2. **How long has it been waiting, and what is that costing?**
3. **Who can unstick it, and have they been told?**

Everything in this document serves those three questions. A feature that does not serve one of them does not ship.

**The evidence this is the right object:** the friction that started this project was a data request that took five days, of which two hours were work. Loop v2 would have tracked "share SharePoint data" as a task with a due date. Loop v3 tracks it as an item that entered a **waiting state** on day one, aged for four days across three owners, and cost the project a week. The second framing is the one that produces action.

---

## 0.3 THE ENFORCEMENT RULE

**Every control must be enforced in the request path, at the lowest layer that can enforce it, and proven by a test that fails when the control is removed.**

Practically, for every rule in this document:

1. **Where is it enforced?** Name the file. Database constraint > RLS policy > API middleware > handler > UI. Pick the lowest one that can do the job.
2. **What test proves it?** The test must *fail* if you delete the enforcement. A test that asserts the policy file contains a string is not a test — that is the mistake `packages/db/test/isolation.spec.ts` currently makes.
3. **Is the UI the only place it lives?** If yes, it is not enforced. UI checks are conveniences. Every one must have a server-side twin.

Three things follow that are non-negotiable and are checked in CI:

- **`can()` is called by middleware, not by handlers.** A handler cannot forget what it never had to remember. Any route reachable without an authorization decision fails the build.
- **Tenant context is set by middleware from the verified token, never from a request body, ever.** Grep for `body.tenantId` in CI and fail on any match outside a test fixture.
- **The isolation test seeds two tenants and asserts zero rows leak on SELECT, UPDATE, and DELETE.** It must fail if RLS is disabled on any table. This test is also the SOC 2 evidence artifact.

---

## 0.4 The six structural changes

Each has its own file.

| # | Change | Replaces | File |
|---|---|---|---|
| 1 | **One stack, one schema.** Kill the dual data plane. | Vite SPA + Supabase `org_id` **and** Fastify + Drizzle `tenant_id` coexisting | `01_CONSOLIDATION.md` |
| 2 | **Coordination mode.** A tenant-level setting that changes how the whole product behaves, derived from organizational configuration theory. | One hardcoded behaviour that implicitly assumed a creative agency | `03_COORDINATION_MODES.md` |
| 3 | **Flow as the primary object.** Waiting states, aging, cost of delay, buffers. | Counts of open/at-risk/overdue commitments | `04_FLOW_ENGINE.md` |
| 4 | **Evidence-based check-ins.** Never ask for a status. Ask for observable facts. | "How's it going, and is anything blocking you?" | `05_CONVERSATION.md` |
| 5 | **Enforcement layer.** Authorization, isolation, opt-in, compliance, injection defence — all moved into the request path with failing tests. | Policy files and localStorage | `06_ENFORCEMENT.md` |
| 6 | **A perception-first design system.** Disjoint brand and status colour sets, redundant encoding, calm defaults, one pre-attentive channel per signal. | Lime as both brand and accent, gold as both brand accent and "at risk" | `07_DESIGN_SYSTEM.md` |

---

## 0.5 What gets deleted

Deletion is part of this build. Each of these is removed, not deprecated.

| Delete | Why | Audit reference |
|---|---|---|
| The entire Fastify in-memory store | Two data planes is the root cause of the false-confidence problem | `apps/api/src/store/memory.ts` |
| One of the two migration families | Keep `packages/db` (`tenant_id`, FORCE RLS). Archive `supabase/migrations` | §3 |
| The 60-second browser autonomy engine | A client-side cron is a demo artifact that will silently diverge from server behaviour and cannot be trusted for anything | `src/context/EngineContext.tsx:8,73-81` |
| localStorage persistence of compliance, notice ack, governance rules, messaging approval queue | These are legal and safety records | `docs/DECISIONS.md:10` |
| The four count-based stat cards as the dashboard hero | Counts are not the signal; waiting time is | `Dashboard.tsx:35-43` |
| "Responded to 4 of 5 check-ins" and every per-person response metric | Attributional measurement — see §0.6 | v2 spec §7.8 |
| `owner_email` from the extraction output schema | A model-supplied address adjacent to a send path | `extract-commitments/index.ts:16,47` |
| Demo login without a password check | Not defensible in any environment reachable from the internet | `AuthContext.tsx:136-148` |
| Hardcoded JWT fallback secret | Fail to boot instead | `apps/api/src/plugins/auth.ts:49` |
| `src/components/layout/Sidebar.tsx`, `Topbar.tsx` | Dead — shell is `AppLayout.tsx` | §2 |

---

## 0.6 The measurement constraint, restated harder

v2 got this half right. It removed individual performance scores because the EU AI Act prohibits them. The operations literature says the constraint is **wider** than the law.

Austin's finding is that under **partial supervision** — every knowledge-work setting — measurement produces dysfunction because people optimize the observable dimension at the cost of the unobservable ones. The part that matters here: **measurement intended purely as information becomes dysfunctional as soon as people perceive it as attributable to them.** Intent is irrelevant. Perception is the mechanism.

So the rule is not "do not score people." It is:

> **No screen, export, API response, or report may present a metric that a reasonable employee would read as being about them rather than about the work.**

This kills things v2 permitted:
- Per-person response rates, anywhere
- Per-person on-time completion percentages
- Any leaderboard, ranking, or comparison between people
- Sorting a team list by any performance-adjacent column
- "Last check-in response" as a column in the team directory

And it changes how legitimate things are framed:
- ✅ "This item has been waiting 6 days" — about the item
- ❌ "Kayode has 3 overdue items" — about the person
- ✅ "3 items are waiting on the data team" — about the queue
- ❌ "Kayode responds to 60% of check-ins" — about the person

The team page still exists. It shows **the work in a person's queue** so a manager can help, not **a judgement of the person**. §08 specifies exactly what it may render.

**This is also good product design, not only compliance.** A tool people believe is scoring them gets gamed, and gamed data is worthless. The compliant design and the useful design are the same design.

---

## 0.7 The watermelon problem — the risk nobody has raised

The single largest threat to Loop's data quality is not extraction accuracy. It is that **people report green when things are red**, and they do it rationally: in most organizations a red status triggers scrutiny, so green is the cheaper answer. The phenomenon is well documented — status reports show green for months, then reveal a red interior days before a deadline.

A WhatsApp bot that asks "how's it going?" collects watermelons **by default and at scale**. v2 would have industrialized the problem.

The antidote is not a better reporting system. It is three design commitments, specified fully in `05_CONVERSATION.md`:

1. **Never ask for a status.** Ask for observable facts — what finished, what is being waited on, what happens next — and derive status from them. A person can shade a colour without lying. It is much harder to shade "what's the last thing that got finished on this?"
2. **Make "waiting" the cheapest possible answer.** One tap. Framed as a routing request on their behalf, never as a confession. The person who reports a blocker must experience help arriving, not attention arriving.
3. **Corroborate against objective signals.** Compare self-report to whether the artifact appeared, the meeting happened, the dependency closed. Divergence flags **the item** for a human look. It never flags the person, and it is never shown as a per-person accuracy figure — that would recreate exactly the attributional measurement §0.6 forbids.

---

## 0.8 Reading order

| File | Contents |
|---|---|
| `00_OVERHAUL_BRIEF.md` | This file |
| `01_CONSOLIDATION.md` | Killing the dual stack; target architecture; migration |
| `03_COORDINATION_MODES.md` | The cross-industry engine |
| `04_FLOW_ENGINE.md` | Waiting, aging, cost of delay, buffers, fever charts — **and all schema changes** |
| `05_CONVERSATION.md` | Anti-watermelon check-in design; full message set |
| `06_ENFORCEMENT.md` | Authz, isolation, opt-in, compliance, injection — with tests |
| `07_DESIGN_SYSTEM.md` | Perception, colour, type, components, motion |
| `08_PAGES.md` | Every page, every control, every state |
| `09_CONNECTORS.md` | Every integration |
| `10_REPORTING.md` | The weekly report, rebuilt |
| `11_BUILD_ORDER.md` | Remediation first, then phases, then launch |

**On the base schema:** `packages/db/migrations/0001_init.sql` already exists and is correct — the audit confirms it has forced RLS, transaction-scoped tenant context, and a sound table structure. It is the foundation. `04_FLOW_ENGINE.md` specifies only the deltas on top of it. There is no separate domain-model file because there does not need to be one.
