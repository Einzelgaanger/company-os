# Data Protection Impact Assessment (DPIA) — Template

**Product:** Loop (work-coordination agent)  
**Role:** Customer (data controller) completes this before inviting employees.  
**Related:** GDPR Art. 35; Kenya ODPC DPIA Guidance; Loop constraint **C-3**.

## 1. Description of processing

| Field | Customer input |
|---|---|
| Controller | |
| Processor | Loop (vendor) |
| Purposes | Detect/track work commitments; WhatsApp check-ins; escalation; aggregate surveys; project reporting |
| Data categories | Names, work email/phone, meeting transcripts (text), calendar metadata, commitment records, WhatsApp messages, survey answers |
| Data subjects | Employees / contractors of the customer |
| Recipients | Customer admins/managers (scoped); Loop ops (support); sub-processors (see sub-processor list) |
| Retention | Per Loop retention schedule (transcripts/messages default 12 months; email bodies purged 7 days post-extraction) |
| International transfers | Document region(s) and transfer basis |

## 2. Necessity and proportionality

- Why is systematic coordination necessary for the stated purpose?
- Why not a less intrusive alternative (manual status, optional-only tooling)?
- How is processing limited to work systems the org connected, plus exclusion filters?

## 3. Risks to employees

| Risk | Likelihood | Severity | Notes |
|---|---|---|---|
| Privacy intrusion / monitoring chill | | | |
| Function creep into performance management | | | Mitigated by C-1 (no individual scores) |
| Sensitive topics in meetings/email | | | Mitigated by exclusion filters |
| Incorrect commitment attribution | | | Mitigated by review queue + precision gates |
| Aggregate sentiment re-identification | | | Mitigated by min-n=5 (C-2) |

## 4. Mitigations (pre-filled for Loop)

- Transparency notice + acknowledgement before processing (C-3)
- No individual performance scores / rankings (C-1)
- No individual emotion inference; aggregate sentiment only, min n=5 (C-2)
- Opt-in WhatsApp; quiet hours; working days (C-6)
- RLS tenant isolation; audit log; DSR self-service
- Reader/validator/actor split — no action from instructions in content (C-4)

## 5. Residual risk and decision

| Residual risk | Acceptable? | Sign-off |
|---|---|---|
| | ☐ Yes ☐ No | Name / date |

## 6. Consultation

- Works council / employee representatives required? ☐ Yes ☐ No  
- If yes, consultation date / outcome:

## 7. Review

Review at least annually, or on material change to processing, connectors, or law.
