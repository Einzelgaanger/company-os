# Runbook — Incident Severity 1 (SEV-1)

**Definition:** Cross-tenant data exposure, credential compromise, or confirmed exfiltration.

**Targets:** Page immediately · **Contain within 1 hour** · **Customer notice within 24 hours** · Regulator notice per GDPR Art. 33 (**72 hours** to SA) and Kenya ODPC expectations where applicable.

## 1. Declare

1. Page on-call + engineering lead.
2. Open an incident channel / bridge; name it `sev1-<date>-<short>`.
3. Assign a single **Incident Commander (IC)** — only the IC speaks externally until handoff.

## 2. Contain (≤ 1h)

1. Revoke compromised credentials/keys (API keys, DB roles, JWT secrets, OAuth client secrets).
2. Disable the affected path (feature flag, webhook, queue consumer, or network deny).
3. **Snapshot evidence before remediation** (logs, `audit_log` slices, relevant Redis keys, deploy SHA). Do not destroy forensics.
4. If cross-tenant exposure: freeze related tenants’ outbound messaging; preserve RLS / DB state for analysis.

## 3. Assess scope

1. Query `audit_log` and access logs for tenant IDs, actors, time window, and resources touched.
2. Determine: number of tenants, number of data subjects, data categories, whether data left the boundary.
3. Record blast radius in the incident doc (facts only).

## 4. Notify

1. **Customers:** within 24h of awareness for SEV-1 — what happened, what data, what we did, what they should do.
2. **Regulators:** GDPR Art. 33 within 72h when personal data breach criteria met; follow Kenya ODPC notification rules for the pilot.
3. Do not speculate; correct prior notices if facts change.

## 5. Remediate

1. Patch root cause; rotate all possibly exposed secrets.
2. Verify isolation (run tenant isolation suite / RLS checks).
3. Re-enable paths gradually with heightened monitoring.

## 6. Post-mortem

1. Blameless post-mortem within **5 business days**.
2. Publish summary to affected customers.
3. File follow-ups with owners and due dates; track to close.

## Contacts (fill for each environment)

| Role | Contact |
|---|---|
| On-call | |
| IC backup | |
| Legal / privacy | |
| Customer success | |
