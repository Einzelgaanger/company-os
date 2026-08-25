# 11 — Scale and Operations

## 11.1 The four things that break first

At 20 people, nothing breaks. The failures below appear in a predictable order as tenant size grows, and each has a known fix. Build the fix at the stage indicated, not earlier (waste) and not later (rewrite).

| # | Breaks at | Symptom | Fix | Build in |
|---|---|---|---|---|
| 1 | ~200 users/tenant | Manual invites are unmanageable; ex-employees keep access | SCIM + SSO | Phase 4 |
| 2 | ~500 users/tenant | Flat roles and single `manager_id` can't express a real org | Teams, nested reporting, group→role mapping | Phase 4 |
| 3 | ~2,000 users/tenant | LLM cost becomes a top-three line item; batch jobs starve live traffic | Tiered routing, caching, Batch API, per-tenant budgets | Phase 3 |
| 4 | ~5,000 users/tenant | Query latency on pooled tables; one noisy tenant degrades others | Read replicas → partitioning → silo for the largest tenants | Phase 6 |

---

## 11.2 Database scaling path

Follow in order. Do not skip ahead; each step buys a lot and each later step costs a lot.

1. **Indexes with `tenant_id` leading.** Already mandated in `02_DATA_MODEL.md`. This alone carries thousands of tenants.
2. **Read replica** for all report generation, dashboards, and analytics. **No dashboard query ever touches the primary.** Route via `getTenantDb(tenantId, { replica: true })`.
3. **Partition the high-volume tables** by month: `messages`, `ai_runs`, `audit_log`, `commitment_events`. These grow without bound and are almost always queried by recent time range. Partitioning also makes retention purges a `DROP PARTITION` instead of a mass `DELETE`.
4. **Move the largest tenants to silo.** One per week, per the runbook. Triggered by contract requirement, data-residency need, or a tenant exceeding ~15% of pooled load.
5. **Shard by `tenant_id` only as a genuine last resort.** If steps 1–4 are done properly this is years away, and by then the shape of the load will be known.

**Connection pooling:** PgBouncer in transaction mode. This is precisely why tenant context must use `set_config(..., true)` — transaction-scoped. A plain `SET` leaks tenant state between pooled connections and is a cross-tenant exposure waiting to happen.

---

## 11.3 AI cost at scale

The economics that matter: at ProDG's ~20 people this is negligible. At 20,000 employees generating thousands of meetings and tens of thousands of messages daily, unoptimized inference becomes the largest variable cost in the business and can invert the unit economics.

**Applied together, the levers below reliably cut spend by a large multiple without quality loss:**

| Lever | Applies to | Effect |
|---|---|---|
| **Model routing** | Classification vs extraction vs synthesis | Largest single saving; most traffic is classification, which is the cheapest task |
| **Prompt caching** | Stable system prompts, schemas, user/project rosters | Large reduction on repeated input; also improves latency |
| **Batch API** | Report synthesis, theme summarization, historical backfill | ~50% discount **and** separate rate limits, so a backfill cannot starve live check-ins |
| **Semantic cache** | Repeated near-identical classifications | Meaningful hit rate, but **worthless for the first 4–6 weeks** — do not budget for it early |
| **Context compaction** | Long transcripts | Send only the segments plausibly containing commitments, not the full hour |

**Cost attribution is not optional.** Every `ai_runs` row records tenant, task, tier, tokens, and cost. Without per-tenant cost you cannot price the product, cannot identify an abusive tenant, and cannot tell whether a margin problem is one customer or all of them.

**Budget enforcement, per tenant:** at 80% alert; at 100% degrade gracefully — classification continues (cheap, keeps the core loop alive), extraction queues, deep-tier synthesis defers. **Never silently stop.** Show the state in `/settings/messaging` and notify admins.

**Quality drift guard:** the 3–5% sampling and 3% disagreement threshold in `05_AI_PIPELINE.md` §5.2. A cost optimization that quietly degrades accuracy is worse than no optimization, because the failure is invisible until trust is already gone.

---

## 11.4 Observability

**Traces (OpenTelemetry):** every request and job carries `tenant_id`, `user_id`, `job_id`. A full trace from webhook → extraction → check-in scheduled must be reconstructable from one trace ID. Debugging "why did Kayode get that message" is a daily support question; make it a one-query answer.

**Golden metrics, per tenant:**
| Metric | Alert |
|---|---|
| Ingestion lag (source event → stored) | > 30 min |
| Extraction lag (stored → commitments created) | > 2 h |
| Check-in delivery success rate | < 95% |
| Inbound classification confidence, p50 | < 0.75 |
| Escalation routing accuracy (manually re-routed %) | > 10% |
| Items in `/review` | > 25 |
| WhatsApp opt-out rate, 7-day | > 2% |
| Connection age since last sync | > 6 h |
| AI spend vs budget | > 80% |
| Report generation success | any failure |

**Business metrics for the pilot** (these are what prove the product works, and they belong on an internal dashboard from week one):
- Median time-to-resolution per commitment, trending
- **Median days spent in `blocked` state** — the referral-chain metric
- Check-in response rate
- Escalations resolved without a second hop
- Manual status meetings eliminated (self-reported by the pilot team monthly)

**Error budget / SLOs:** API availability 99.5%, check-in delivery within 15 minutes of schedule 99%, weekly report delivered on schedule 99.9%. The report SLO is highest deliberately — a missed report is the most visible failure to the person who signs the contract.

---

## 11.5 Onboarding a new company at scale

The self-serve path must work without Loop staff involvement for a 200-person company.

1. Owner signs up, completes the compliance gate (`03_IDENTITY_ACCESS.md` §3.5.1).
2. Connects the org-level meeting tool.
3. Configures SSO + SCIM → the directory populates users, teams, and managers automatically.
4. Configures exclusion rules (defaults pre-populated).
5. Configures the ownership map — **this is the step that needs a human conversation** for a large org, because it encodes tribal knowledge about who owns what. Provide a starter template derived from directory departments, and expect it to be edited.
6. **Staged rollout, enforced by the product:** week 1 a pilot group only (admin selects 10–20 people), week 2 one department, week 3+ org-wide. The product should nudge this sequence rather than allowing an org-wide switch-on, both for Meta tier ramping (`06_WHATSAPP.md` §6.6) and because a bad first week with 500 people is unrecoverable.
7. Employee notices publish; each person acknowledges before any processing touches them.

**What cannot be automated, and should be sold as onboarding services rather than pretended away:** the ownership map for a complex org, integration with unusual legacy systems, and the customer's own DPIA and works-council process. Being straight about this is better than shipping a self-serve flow that quietly fails for the customers worth the most.

---

## 11.6 Multi-region and residency

- `tenants.region` drives which database and object-storage bucket a tenant lives in.
- Launch regions: `eu-west-1` (GDPR), `af-south-1` (Kenya/EA pilot). Add `us-east-1` on demand.
- The control plane holds routing and billing only — never customer content.
- LLM calls must route to a provider endpoint in a compatible region; record the region on `ai_runs` for the data-flow map an enterprise buyer will ask for.
- Cross-region replication only for disaster recovery within the same jurisdiction, never across a residency boundary.

---

## 11.7 Backup and recovery

- Continuous WAL archiving; point-in-time recovery to any moment in the last 7 days; nightly full snapshots retained 30 days.
- **Per-tenant restore is a first-class runbook, not an afterthought.** In a pooled model, restoring one tenant means point-in-time recovery to a scratch instance, extracting that `tenant_id`, and re-importing — this is slow, so document and rehearse it. Silo tenants restore trivially, which is another line in the enterprise sales conversation.
- **Rehearse restores quarterly.** Record the result in `/docs/runbooks/restore-drill-log.md`. An untested backup is a belief, not a control, and auditors treat it as such.
- RTO 4 hours, RPO 15 minutes. Publish both; enterprise buyers ask.
