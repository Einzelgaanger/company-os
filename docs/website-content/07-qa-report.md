# Phase 8: QA report

## Summary

1. **Positioning:** Company OS is an agentic chief of staff for teams that lose commitments in meetings and chat. It captures owned commitments, checks in via Chat or each person's messaging channel and escalates blockers with context. Project leads get operational reports, not people scorecards.
2. **Five biggest content changes:** (1) Hero promise rewritten around Chat + preferred channel + operating picture. (2) Six-beat Check step and check-in ribbons no longer claim Telegram-first / email fallback as the launch path. (3) `#how` now lands on the six-beat loop, not the problem section. (4) Meta tags and brand strings lose em dashes and match the product definition. (5) Privacy/Terms messaging language aligned with Chat-default reality.
3. **Capabilities newly represented:** In-app Chat (C4), preferred channel (C5), extract review gate (C3) in Detect beat, WhatsApp honesty as "when connected" (C7 Beta).
4. **Claims removed or softened:** Telegram as primary channel; email as check-in fallback; WhatsApp as always-on; "mail" as a Detect source in the marketing beat.
5. **Open inputs needed:** See `00-open-questions.md` (buyer persona, proof, WhatsApp Meta live, public pricing, security page, email check-in confirmation, contact email, AI training statement).

---

## 10.1 Truth checks

- [x] Every product claim maps to a Shipped (or honestly Beta) capability.
- [x] No Planned/Internal presented as available.
- [x] No invented numbers, logos, testimonials, certifications. Metrics 6/1/0 are structural product claims.
- [x] `[NEEDS INPUT]` listed in open questions and `llms.txt`.
- [x] Recent Chat / preferred-channel work reflected.

## 10.2 Clarity checks

- [x] 5-second test: Brand + slogan + rewritten promise states what / who / outcome.
- [x] Headlines-only: problem → six beats → daily ops → modes → audiences → ribbons → CTA.
- [x] Swap-the-logo: key lines name waiting, commitments, Chat, escalations with context.
- [x] So-what: feature blocks keep outcome language.
- [x] Read-aloud: voice preserved (calm, operational).

## 10.3 Flow checks

- [x] Question sequence respected; `#how` fix applied.
- [x] Primary next step on homepage: signup. Legal pages cross-link; no new FAQ (proposed only).
- [x] CTAs match destinations (`/signup`, `#how`).
- [x] Anxiety: review gate, anti-scorecard, Chat without Meta; habit: channels you already use. Full FAQ still proposed.

## 10.4 Style checks

- [x] No em dashes in touched visitor-facing marketing/legal/meta strings (code comments in `brand.ts` may still use them).
- [x] No Oxford commas in touched visitor-facing strings (serial lists fixed on legal + homepage arrays).
- [x] No banned hype words introduced.
- [x] Glossary terms consistent (Chat, commitment, check-in, escalate, report).
- [x] Voice matches Phase 2 adjectives.

## 10.5 Technical checks

- [x] Build passes (`npm run build`: tsc + vite build OK, 2026-09-25).
- [ ] Lint: not run as a separate script in this pass; TypeScript compile succeeded as part of build.
- [ ] Visual breakpoints: not browser-verified in this session; no layout/CSS changes; flag for human glance at 360/768/1280/1536.
- [x] Titles, meta, OG/Twitter updated.
- [x] JSON-LD added (Organization + SoftwareApplication; no fake ratings).
- [x] `llms.txt` present at `public/llms.txt`.
- [x] One H1 on homepage remains brand name; section H2s unchanged structurally.
- [x] `robots.txt`: none found in repo. Logged as Q8; do not invent crawler policy without approval.
