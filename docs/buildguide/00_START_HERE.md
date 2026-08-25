# LOOP — Enterprise Build Specification v2.0

**Product:** Loop — autonomous work-coordination agent for companies
**Author:** Alfred Maweu
**Audience:** Cursor (implementation agent)
**Pilot customer:** ProDG Studios (Nairobi, Kenya)
**Status:** Ready to build

---

## 0.1 How to use this specification

This spec is written so that **no product, architectural, legal, or UX decision needs to be made during implementation.** Every schema, endpoint, page, permission, prompt, message template, and compliance control is specified.

Read the files in this order. Do not skip 00 or 10.

| File | Contents |
|---|---|
| `00_START_HERE.md` | This file. Non-negotiable constraints. Read first. |
| `01_ARCHITECTURE.md` | Stack, services, tenancy model, queues, environments |
| `02_DATA_MODEL.md` | Complete Postgres schema + RLS policies |
| `03_IDENTITY_ACCESS.md` | Auth, SSO, SCIM, roles, admin invites, onboarding |
| `04_INTEGRATIONS.md` | Connectors, OAuth scopes, CASA, governance filters |
| `05_AI_PIPELINE.md` | Extraction, classification, prompt-injection defence, cost control |
| `06_WHATSAPP.md` | Templates, opt-in, Meta tiers, conversation design |
| `07_SURVEYS_SENTIMENT.md` | Dynamic AI surveys, aggregate sentiment, legal guardrails |
| `08_REPORTING.md` | Progress %, weekly PDF, email delivery |
| `09_UI_PAGES.md` | Every route, page, component, state, copy string |
| `10_SECURITY_COMPLIANCE.md` | SOC 2, DPIA, EU AI Act, Kenya DPA, retention, IR |
| `11_SCALE_OPS.md` | Scaling path, observability, cost attribution, SLOs |
| `12_BUILD_PHASES.md` | Phased build order + launch checklist |

**If something is genuinely not covered:** make the smallest reasonable assumption, log it in `docs/DECISIONS.md` with a one-line rationale, and continue. Do not stop to ask.

**If a change would violate anything in §0.2 below:** stop and flag it. Those are the only hard stops.

---

## 0.2 NON-NEGOTIABLE CONSTRAINTS

These come from binding law and platform policy, not preference. Violating any one of them creates legal exposure or gets the product banned from a platform it depends on. They are stated here once and enforced throughout the spec.

### C-1 — Loop is a work-coordination system, NOT a performance-evaluation system

Under **EU AI Act Annex III §4(b)**, AI systems used to "monitor and evaluate the performance and behaviour" of workers, or to make decisions on promotion or termination, are classified **high-risk**, triggering the full obligations of Articles 9–15 (risk management, data governance, technical documentation, logging, transparency, human oversight, accuracy). Annex III §4(c) separately covers real-time monitoring of workers' emotional or behavioural states.

**Implementation consequences:**
- There is **no individual performance score, ranking, rating, or league table** anywhere in the product. Not in the UI, not in reports, not in the API, not in the database.
- The v1.0 spec's `performance record` feature is **removed**. Do not build it.
- Reports describe **work items and projects**, not people's competence. "Project Atlas is 60% complete, 2 items overdue" is in scope. "Kayode is performing at 60%" is not, and must be impossible to produce.
- Add a hard product guardrail: an org-level flag `high_risk_use_prohibited` (default `true`, cannot be disabled through the UI) that blocks any endpoint returning per-person aggregate scoring.
- The Terms of Service must state that Loop is not to be used as the basis for promotion, discipline, or termination decisions, and that a customer doing so becomes the deployer of a high-risk AI system with independent obligations under Article 26.

### C-2 — No emotion inference on individuals. Ever.

**EU AI Act Article 5(1)(f)** prohibits outright — not regulates, *prohibits* — the use of AI to infer emotions of a person in the workplace, with narrow exceptions only for medical or safety purposes. Penalties reach €35M or 7% of global turnover. The prohibition has been in force since 2 February 2025. Commission guidance interprets "workplace" broadly, and explicitly excludes general stress, burnout, and wellbeing monitoring from the medical exception.

The prohibition targets emotion inference from **biometric data** (face, voice, physiological signals). Pure text sentiment is a narrower case, but the boundary is legally unsettled where text sentiment is used to infer an individual employee's emotional state.

**Implementation consequences — build to the safe side of the line:**
- **Never process voice, video, or physiological data for emotional inference.** Meeting audio is transcribed to text and the audio is discarded; no tone, pitch, or prosody analysis. Ever.
- Sentiment analysis operates **only on text**, **only on content the employee deliberately submitted to Loop** (their own check-in and survey replies), and **only in aggregate**.
- **Minimum aggregation threshold: 5.** No sentiment output — chart, number, or sentence — may ever be derived from fewer than 5 respondents. Enforce this in the query layer, not the UI.
- **No individual sentiment record is stored.** The `survey_responses` table stores a per-response sentiment label transiently for aggregation, then the individual label is purged on aggregation (see `07_SURVEYS_SENTIMENT.md` §7.6). No endpoint may return a sentiment value keyed to a `user_id`.
- Sentiment output is a **theme summary about work conditions**, e.g. "unclear requirements were raised by multiple people this week" — never "person X is unhappy."

### C-3 — Employee monitoring requires a lawful basis, a DPIA, and prior notice

Under **GDPR**, employee consent is not a valid lawful basis for workplace monitoring (EDPB Guidelines 05/2020) because of the employer–employee power imbalance. The operative basis is **legitimate interest, Article 6(1)(f)**, backed by a documented balancing test. A **DPIA under Article 35 is mandatory** before deployment for systematic monitoring, and failing to do one is itself a standalone violation regardless of whether the monitoring was proportionate. Several member states (Germany §87 BetrVG, Austria, Netherlands WOR, France) additionally require **works council consultation** before deployment.

**Implementation consequences:**
- Onboarding for a new organization **cannot complete** until an admin has confirmed a compliance checklist (see `10_SECURITY_COMPLIANCE.md` §10.4). This is a blocking gate, not a warning banner.
- Every employee sees a **transparency notice** on first login stating exactly what Loop reads, why, how long it is kept, and who can see the output. They must acknowledge it before any data about them is processed.
- Every employee has a **"What Loop knows about me"** page (`/settings/my-data`) showing all their own data and a self-service export and erasure request. This is a hard requirement, not a nice-to-have.
- Ship a **DPIA template** and a **Legitimate Interest Assessment template** as customer-facing artifacts in `/docs/compliance/`.

### C-4 — The agent must never be able to act on instructions found in content it reads

Loop reads untrusted content (inbound email, meeting transcripts, shared documents), holds private data (the org's commitments and connections), and can communicate externally (WhatsApp, email). That is the complete **"lethal trifecta"** described by Simon Willison, and it makes indirect prompt injection unconditionally exploitable if the architecture does not break it. Prompt injection remains OWASP's #1 LLM risk in the 2026 edition and is not solvable by prompt hardening or model choice.

**Implementation consequences — this is architectural, not a filter:**
- **Split the reader from the actor.** The extraction model that sees untrusted content has **no tools, no network access, and no ability to trigger any action.** Its only permitted output is JSON validated against a strict schema. See `05_AI_PIPELINE.md` §5.4.
- **Recipients are never taken from model output.** Every phone number, email address, and user ID used in an outbound action is resolved from the database by ID. If extraction returns a name, it is matched against the org's user table; if there is no confident match, the item is flagged for human review and no message is sent.
- **No free-form model text is ever sent to an external party.** Outbound WhatsApp messages are rendered from pre-approved templates with variables bound to database values only.
- Content is sanitized deterministically before the model sees it (strip HTML, zero-width characters, base64 blobs, and quoted reply chains).
- Extraction runs inside a per-source context boundary. Content from one email thread cannot influence extraction on another.

### C-5 — Restricted Google scopes gate the email integration

Gmail read access uses **restricted OAuth scopes**, which require passing an annual **CASA (Cloud Application Security Assessment)** by a Google-approved assessor before production use beyond 100 users. Budget **6–12 weeks end to end** for a first submission and annual re-validation thereafter; cost varies by tier from several hundred to several thousand dollars.

**Implementation consequences:**
- **Do not put Gmail on the critical path for launch.** Build meeting transcripts and calendar first. Email ingestion is Phase 5, behind a feature flag, and ships only after the CASA Letter of Assessment is in hand.
- Request the **narrowest scope that works**. Loop needs read-only metadata and body text for commitment extraction; it never needs send or delete. Verify current scope classification at build time — classifications change.
- The connector architecture must allow email to be **disabled entirely per tenant** without degrading any other feature.

### C-6 — WhatsApp is a permissioned channel with hard platform limits

Meta's WhatsApp Business Platform requires pre-approved templates for all business-initiated messages, explicit per-user opt-in, and enforces a tiered daily cap that starts at **250 unique contacts per 24 hours** for an unverified business, rising through 1K / 10K / 100K to unlimited based on quality and volume, re-evaluated every 6 hours. Free-form replies are permitted only inside a **24-hour service window** opened by the user's own last message. Quality rating drops when block/opt-out rates exceed roughly 2–3%, and a dropped rating reduces the sending tier. As of **15 January 2026, Meta's terms bar general-purpose AI chatbots** from the Business Solution — purpose-specific business assistants remain permitted.

**Implementation consequences:**
- Build a **template registry** table; no code path may send an un-registered template.
- Build a **rate-limited outbound queue** with per-tenant and global caps, respecting the current tier (80 msg/s standard throughput ceiling).
- Track **opt-in explicitly and per-user**; a user with no recorded WhatsApp opt-in is never messaged, regardless of admin settings.
- Track the **24-hour window state** per user; free-form (non-template) sends are only legal inside an open window.
- Monitor block and opt-out rate per tenant; auto-throttle a tenant above 2%.
- Loop's assistant is **scoped to work coordination only** and must be documented that way in the Meta submission. It must refuse open-domain chat.

### C-7 — Kenya's Data Protection Act applies to the pilot

Kenya's **Data Protection Act, 2019** requires registration with the **Office of the Data Protection Commissioner (ODPC)** for entities with more than 10 employees or annual turnover above **KES 5,000,000**, and for entities processing data of 10,000+ data subjects annually. Registration is via the ODPC online portal. The ODPC has published a Guidance Note on Data Protection Impact Assessments. Certain organizations must appoint a Data Protection Officer.

**Implementation consequences:**
- Loop (the vendor entity) registers with the ODPC **as a data processor** before the pilot goes live. ProDG registers **as a data controller** if it meets the threshold.
- This is a launch blocker in `12_BUILD_PHASES.md`, not a follow-up task.

---

## 0.3 What Loop does, stated once

Loop connects to the systems where work is already discussed and continuously:

1. **Detects commitments** — who owes what, to whom, by when — from meeting transcripts, calendar events, and (later) email.
2. **Tracks them** in one place with full provenance back to the source.
3. **Checks in proactively over WhatsApp, before the due date** — asking about progress, blockers, and what the person needs.
4. **Escalates automatically** to the correct owner when something stalls, with full context attached, eliminating the referral chain.
5. **Runs short, dynamically generated surveys** about working conditions, blockers, and process friction.
6. **Reports** — a weekly PDF emailed to configured recipients covering project progress percentages, statuses, open issues, organizational blockers, and aggregate themes from team feedback.

What Loop does **not** do: score individuals, infer emotions, monitor keystrokes or screens, read content the customer has excluded, or take any action based on instructions found inside content it read.

---

## 0.4 Naming and repo conventions

- Product name: **Loop**. Single find-and-replace if it changes.
- Repo: monorepo, `pnpm` workspaces.
- Package naming: `@loop/web`, `@loop/api`, `@loop/workers`, `@loop/shared`.
- Every database identifier: `snake_case`. Every TypeScript identifier: `camelCase`. Every React component: `PascalCase`.
- Every table has `tenant_id uuid not null` as its first column after `id`, and `tenant_id` is the **leading column of every index** on that table.
- Every timestamp is `timestamptz`, stored UTC, rendered in the tenant's configured timezone.
- Every enum is a Postgres `text` column with a `CHECK` constraint, not a native enum type (native enums are painful to alter).
