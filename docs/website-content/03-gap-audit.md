# Phase 3: Gap audit

Compare `01-product-truth.md` with `02-site-inventory.md`.

## Gaps by category

| ID | Category | Where | Issue |
|---|---|---|---|
| G1 | Outdated | FLOW Check, CHANNELS, RIBBONS, AUDIENCE, Privacy | Telegram primary + WhatsApp/email fallback. Product launch default is **in-app Chat** with per-person preferred channel (C4, C5). |
| G2 | Undersold | Entire homepage | In-app Chat never named. Preferred channel never explained. |
| G3 | Undersold | Homepage | Meeting extraction + review queue (C2, C3) buried as "Detect" only. |
| G4 | Undersold | Homepage | Waiting / Flow views (C12) named weakly as "waiting trail". |
| G5 | Oversold | FLOW Check, Privacy | Email as messaging fallback not clearly shipped as check-in channel (Q6). |
| G6 | Oversold | Risk | WhatsApp implied always available; often Beta / ops-gated (C7). |
| G7 | Muddy | Hero promise | 234 chars, em dash, packs three ideas; hard to scan in 5 seconds. |
| G8 | Muddy | Meta / brand | Em dashes in title and descriptions (Rule 8). |
| G9 | Generic | CTA band H2 | "Put an agentic chief of staff on your company" is category-clever but weak on outcome. |
| G10 | Inconsistent | Nav vs footer | Footer says "Features"; nav says "Product". |
| G11 | Missing proof | Statement metrics | 6 / 1 / 0 are structural (OK) but no customer proof; trust thin. |
| G12 | Flow break | `#how` on problem section | Anchor "How it works" lands on problem ("The job"), not the six-beat flow. |
| G13 | Flow break | No FAQ | Anxiety (AI accuracy, data, setup) under-addressed on marketing page. |
| G14 | Wrong audience (mild) | Modes | Strong for coordination modes; buyer trigger (ops chaos) could be sharper earlier. |
| G15 | Outdated | Legal messaging bullets | Same Telegram-primary language; omit Chat. |

## Page scores

### Homepage `/`

| Dimension | Score | Why |
|---|---|---|
| Clarity | 3 | Slogan helps; promise is long; Chat missing. |
| Relevance | 4 | Audiences and modes are clear. |
| Value | 4 | Outcomes named (less chasing, reports). |
| Differentiation | 3 | Escalation with context is unique; buried vs boards. |
| Trust | 2 | No FAQ, no Chat honesty, em-dash clutter, thin proof. |
| Action | 4 | Clear signup CTAs; secondary to `#how` OK. |

### Privacy / Terms

| Dimension | Score | Why |
|---|---|---|
| Clarity | 4 | Strong non-HR stance. |
| Relevance | 3 | Channel wording outdated. |
| Value | n/a | Legal. |
| Differentiation | 4 | Explicit anti-scorecard. |
| Trust | 4 | Solid if channel claims fixed. |
| Action | 2 | Weak return path to product. |

## Top 15 changes by impact

1. Rewrite hero promise: what / who / outcome; include Chat (G2, G7).
2. Fix meta title/descriptions: no em dashes; product definition (G8).
3. Update FLOW Check beat: Chat default + Telegram / WhatsApp when linked (G1).
4. Update CHANNELS check-ins and RIBBON check-ins for preferred channel (G1, G2).
5. Soften email check-in claims (G5).
6. Soften WhatsApp as "when connected" (G6).
7. Align `#how` target or problem label so nav matches content (G12) — prefer moving id to flow section without deleting problem.
8. Sharpen Detect step to mention meeting extract + human review (G3).
9. Audience "Everyone" points: reply in Chat or preferred channel (G2).
10. CTA band: outcome-led headline (G9).
11. Footer blurb + glossary consistency (G10).
12. Privacy/Terms messaging channel bullets (G15).
13. Problem aside: shorter product definition (G7).
14. Statement sub: keep anti-scorecard; fix dashes (G8).
15. Propose FAQ section reuse (open question) — do not invent new component without approval; strengthen trust via existing copy (G13).

**Propose (do not execute):** public FAQ block, `/pricing`, `/security` (see `00-open-questions.md`).
