# 10 — Security, Governance, and Compliance

This file answers, concretely, "how do we guarantee the safety of this data." **The honest framing first:** no vendor holding this much data can offer a guarantee, and any enterprise security team will distrust a pitch that claims one. What is offered instead is defence in depth plus verifiable evidence. Build the controls below and the evidence produces itself.

---

## 10.1 Technical controls

### Encryption
- **In transit:** TLS 1.3 minimum, HSTS with preload, no TLS 1.0/1.1/1.2 fallback.
- **At rest:** full-disk encryption on all database and object storage.
- **Field level:** OAuth tokens use **KMS envelope encryption** — a unique data key per token, the data key itself encrypted by a KMS master key. Rotate the master key annually; rotation re-encrypts data keys only, not every row.
- **Enterprise tier:** customer-managed keys (BYOK) for silo tenants, so the customer can revoke Loop's ability to read their data unilaterally. This single feature closes more enterprise deals than any other security control.

### Access control
- **Tenant boundary:** Postgres RLS, forced, with the CI isolation test suite in `01_ARCHITECTURE.md` §1.3 as the proof.
- **Role boundary:** the `can()` authorization layer, `03_IDENTITY_ACCESS.md` §3.2.
- **Visibility boundary:** derived-output inheritance, `04_INTEGRATIONS.md` §4.5.
- **Loop staff access:** **zero standing access to customer data.** Support access requires a documented ticket, time-boxed (max 4 hours), approved by a second person, logged to `audit_log` with `actor_type='admin_support'`, and **the customer is notified** in-app that support accessed their data, with the reason. Notifying the customer is unusual and is exactly why it builds trust.

### Application security
- All input validated with Zod at the boundary. Nothing trusts a client.
- Parameterized queries only (Drizzle); no string-built SQL anywhere.
- CSP with no `unsafe-inline`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Rate limits: 100 req/min per user, 1,000 per tenant, 10/min on auth endpoints.
- Webhook signature verification on **every** inbound webhook. Unsigned requests are rejected before the body is parsed.
- Dependency scanning in CI; critical CVEs block merge; monthly patch cycle.
- Secrets never in code or env files in the repo; loaded from the secret manager at boot.

### Prompt injection
Covered in `05_AI_PIPELINE.md` §5.4. Treat every detection as a security event, not a data-quality issue.

---

## 10.2 Certifications and evidence — sequencing

| When | What | Why then |
|---|---|---|
| Before ProDG pilot | Kenya ODPC registration; DPIA; sub-processor list; AI data-handling policy; incident response plan | Legal minimum to process employee data |
| Month 1–3 of pilot | **SOC 2 Type I** | Unblocks first external conversations; validates control design |
| Month 4–12 | **SOC 2 Type II** (Security + Confidentiality) | 85% of mid-market and ~98% of Fortune 500 buyers want Type II; observation period is unavoidable |
| Before Gmail production | **Google CASA** assessment + Letter of Assessment | Platform requirement (C-5); SOC 2 evidence maps onto CASA via the accelerator, so do SOC 2 first |
| At first EU customer | **GDPR Art. 27 EU representative**; SCCs for transfers | Legal requirement for a non-EU processor |
| At enterprise demand | **ISO 27001** | Requested by European and large enterprise buyers |

**Scope SOC 2 as Security + Confidentiality.** Add Availability only when a contract names an SLA; add Processing Integrity if Loop's output ever drives an automated customer-impacting decision — which, per C-1, it deliberately does not.

**Trust Service Criteria are cheaper to satisfy if built in now:** access review cadence, change management via PR approval, vendor management register, employee security training, offboarding checklist. All of these are process, and retrofitting them is far more expensive than doing them from commit one.

---

## 10.3 Documents to write before launch

Live in `/docs/compliance/`, customer-facing:

1. **DPIA template** — pre-filled for Loop's processing, so a customer completes it in an hour rather than a week. Covers: description of processing, necessity and proportionality, risks to employees (privacy, chilling effect on candid communication, function creep into performance management), mitigations, residual risk.
2. **Legitimate Interest Assessment template** — the three-part test (purpose, necessity, balancing) documented for employee monitoring under GDPR Art. 6(1)(f). Consent is **not** a valid basis in employment and must not be offered as an option.
3. **Sub-processor list** — every third party touching customer data: cloud host, Anthropic (LLM), Twilio/Meta (messaging), WorkOS (identity), Resend (email), Sentry (errors). Published, versioned, with 30-day advance notice of changes and a customer objection right.
4. **AI data-handling policy** — 3–5 pages: which models, what data reaches them, retention by the provider, whether data trains models (it must not — use API tiers that contractually exclude training), opt-outs. **This is now a standard 2026 procurement ask.** Write it before the first questionnaire, not after.
5. **DPA** — GDPR Art. 28 compliant, with SCCs annexed. Expect enterprise buyers to insist on their own template; do not burn weeks arguing.
6. **Incident response plan** — §10.5.
7. **Employee-facing notice template** — the text in `03_IDENTITY_ACCESS.md` §3.5.2, customizable.
8. **Security overview one-pager** — the summary sales sends under NDA before the full SOC 2 report exists.

**Breach notification clause warning:** many enterprise templates demand notification within 24 hours of awareness. Do not agree to anything tighter than the on-call rotation can actually deliver, or the contract creates a breach event Loop cannot meet.

---

## 10.4 EU AI Act posture

| Question | Loop's answer | Where enforced |
|---|---|---|
| Does Loop use prohibited emotion recognition? | **No.** No biometric input of any kind. Text sentiment only, aggregate only, min-n 5, no individual output. | C-2; `07_SURVEYS_SENTIMENT.md` §7.6; DB `CHECK` constraint |
| Is Loop a high-risk Annex III §4 system? | **Not as designed.** It coordinates work; it does not evaluate individuals or inform employment decisions. | C-1; no per-person scoring exists anywhere |
| What if a customer uses it that way anyway? | They become the **deployer** of a high-risk system with independent Art. 26 obligations that cannot be contracted away. | ToS; onboarding attestation; report footer |
| Does Loop log enough? | Yes — `ai_runs` and `audit_log` provide per-decision records aligned with Art. 12 logging expectations. | `02_DATA_MODEL.md` §2.9 |
| Transparency to affected workers? | Mandatory notice + acknowledgement before processing; `/settings/my-data` for ongoing access. | C-3; §3.5.2 |

**Keep this posture reviewed.** The Annex III obligations and Commission guidance are still moving, with key dates through 2026–2027. Assign an owner to review this table quarterly and record the review in `/docs/compliance/ai-act-review-log.md`.

**The commercial argument for staying out of high-risk classification:** it is not just cost avoidance. A tool employees believe is scoring them gets gamed, and gamed data is worthless. The compliant design and the useful design are the same design.

---

## 10.5 Incident response

**Severity:**
| Sev | Definition | Response |
|---|---|---|
| **1** | Cross-tenant data exposure, credential compromise, confirmed exfiltration | Page immediately; contain within 1h; customer notice within 24h |
| **2** | Single-tenant data exposure, successful prompt injection causing an external action | Respond within 2h; affected customer notified within 24h |
| **3** | Service outage, systemic processing failure | Respond within 4h; status page |
| **4** | Degraded feature, connector failure | Next business day |

**Sev 1 runbook** (`/docs/runbooks/incident-sev1.md`): declare → assign a single incident commander → contain (revoke keys, disable the affected path, snapshot evidence before remediation) → assess scope from `audit_log` → notify (customers, and regulators where required — GDPR Art. 33 is 72 hours to the supervisory authority; Kenya's ODPC has its own notification expectations) → remediate → post-mortem within 5 business days, blameless, published to affected customers.

**Cross-tenant exposure is the existential one.** It is the failure that ends a multi-tenant SaaS. That is why RLS is forced, why the isolation test suite blocks the build, and why enterprise customers get the silo option.

---

## 10.6 Data retention

| Data | Default | Configurable | Rationale |
|---|---|---|---|
| Email bodies | **Purged 7 days after extraction** | No | Loop stores commitments, not an email archive. Smallest possible blast radius. |
| Meeting transcripts | 12 months | 3–24 months | Provenance for commitments |
| Meeting audio/video | **Never stored** | No | C-2 |
| Messages (WhatsApp) | 12 months | 6–24 months | Check-in history |
| Individual survey responses | Until cycle close + 90 days | 30–180 days | The person's own DSR access |
| Individual sentiment labels | **Purged at aggregation** | No | C-2 |
| Survey aggregates | Indefinite | — | No personal data remains |
| Commitments & escalations | Indefinite while tenant active | — | The organizational record; the product's value |
| `ai_runs` | 24 months | — | Art. 12 logging, cost analysis |
| `audit_log` | 24 months | 12–84 months | Compliance evidence |
| Deleted tenant | Purged 30 days after offboarding | — | Recovery grace period |

A nightly `housekeeping` job enforces every window and writes a summary to `audit_log`. Retention that exists only in a policy document is not retention.

---

## 10.7 Data subject requests

- Self-service at `/settings/my-data` — export and erasure requests create `dsr_requests` with `due_at = now() + 30 days`.
- **Access:** machine-readable JSON plus a human-readable PDF covering everything keyed to that person.
- **Erasure:** not absolute. Commitments they owned are part of the organizational record and are retained with the person pseudonymized ("Former team member"). Their messages, survey responses, and profile are deleted. **Explain this in the UI at request time** rather than silently partially fulfilling — an honest boundary is defensible; a silent one is not.
- **Rectification:** name, title, phone, manager corrected directly; extracted commitments corrected via `/review`.
- **Objection:** turns off WhatsApp check-ins and survey invitations for that person; they continue using the web app.
- Admins see the queue at `/settings/security` with due dates and overdue highlighting.

---

## 10.8 Kenya-specific (pilot)

- **Loop registers with the ODPC as a data processor.** ProDG registers as a data controller if it exceeds 10 employees or KES 5,000,000 turnover.
- Follow the **ODPC Guidance Note on Data Protection Impact Assessments** for the pilot DPIA.
- Appoint or designate a data protection contact.
- Note that Kenya's DPA defines sensitive personal data broadly (including health, marital and family details, and property information) — another reason the exclusion filters in `04_INTEGRATIONS.md` §4.5 default to blocking HR, medical, and personal-life keywords.
- Cross-border transfer: if data is processed outside Kenya, ensure the transfer basis is documented. Prefer keeping the pilot tenant's data in a single documented region.
