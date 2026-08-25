# Loop — AI data-handling policy

**Version:** 0.1 (scaffold)  
**Audience:** Customers, procurement, security reviewers  
**Related constraints:** C-1, C-2, C-4, C-5

## 1. Purpose

Loop uses AI models to extract work commitments, classify inbound replies, generate aggregate survey themes, and synthesize project reports. Models do **not** score individuals, infer emotions from biometrics, or send free-form outbound messages.

## 2. Models and providers

| Tier | Env | Typical use |
|---|---|---|
| `fast` | `AI_MODEL_FAST` | Reply classification, opt-out detection |
| `standard` | `AI_MODEL_STANDARD` | Commitment extraction |
| `deep` | `AI_MODEL_DEEP` | Report synthesis, survey question generation |

Provider (default): Anthropic API (or successor configured per environment). Region of inference is recorded on `ai_runs` for data-flow maps.

## 3. What data reaches the model

- Sanitized meeting transcript / email **text** (HTML stripped; length-capped)
- Tenant roster: active user **names + emails** only (cached)
- Active **project names** (shortlist)
- For classification: inbound message body + related outbound template context + commitment title

**Never sent to models:** WhatsApp phone numbers as action targets, OAuth tokens, raw audio/video, biometric data, payment data.

## 4. Training and retention by provider

- Loop uses API tiers that **contractually exclude** customer content from model training.
- Loop does not grant providers a license to train on customer data.
- Provider-side retention follows the API agreement; Loop retains `ai_runs` metadata (tokens, cost, latency, validation outcome) per retention policy (default 24 months).

## 5. Architectural controls (C-4)

- **Reader** sees untrusted content; has **no tools**, no network, no DB writes; JSON-only output.
- **Validator** resolves names to user IDs; rejects URLs/phones in model output.
- **Actor** renders pre-approved templates only; never sees untrusted content.
- Injection signals are logged to `injection_events`; autonomous outbound is blocked when review is required.

## 6. Prohibited outputs

- Per-person performance scores / rankings (C-1)
- Sentiment keyed to a `user_id` (C-2); aggregate only, minimum n = 5

## 7. Customer opt-outs / controls

- Connector disable per tenant (including email behind CASA / feature flag)
- Ingestion exclusion rules
- WhatsApp opt-out (STOP)
- AI budget caps and degradation behaviour (never silent total stop)

## 8. Review

Owner reviews this policy quarterly with the EU AI Act posture table (`docs/compliance/`).
