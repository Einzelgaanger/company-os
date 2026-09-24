# Phase 2: Site inventory

Public marketing surfaces only. Auth pages (`/login`, `/signup`) are out of scope for rewrite except CTA destinations.

## Pages

| Route | File | Purpose (as it currently reads) |
|---|---|---|
| `/` | `src/pages/MarketingHome.tsx` + `src/lib/brand.ts` | Single-page product story: problem, loop, channels, modes, audience, ribbons, CTA |
| `/privacy-policy` | `src/pages/legal/Privacy.tsx` | Privacy policy |
| `/terms-of-service` | `src/pages/legal/Terms.tsx` | Terms of service |
| Meta | `index.html` | Title / description / OG / Twitter |

No public FAQ, pricing, about or security pages.

Copy location: hero name/slogan/promise from `BRAND`; section arrays hardcoded in `MarketingHome.tsx`; legal intros and bodies in Privacy/Terms; meta in `index.html`.

---

## Homepage sections (order)

1. **Nav** — How it works, For teams, Reports, Product; Sign in; Get started → `/signup`
2. **Hero** (`mk-hero`) — Brand H1, slogan, promise, CTAs
3. **Problem** (`#how` / `mk-problem`) — The job + aside + tick list
4. **Flow** (`mk-flow`) — Six beats (`FLOW`)
5. **Narrative** (`mk-narrative`) — Check-ins / Escalation / Reports (`CHANNELS`)
6. **Modes** (`#teams` / `mk-modes`) — Five coordination modes (`MODES`)
7. **Audience** (`#reports` / `mk-audience`) — PM / Operators / Everyone (`AUDIENCE`)
8. **Ribbons** (`#product`) — Three feature ribbons (`RIBBONS`)
9. **Statement + metrics** (`mk-statement`)
10. **CTA band** (`cta-band`)
11. **Footer** (`mk-footer`)

---

## Character budgets (key slots)

| Page | Section | Slot | Current text (abbrev) | Current chars | Max chars (safe) | Notes |
|---|---|---|---|---|---|---|
| `/` | Hero | Slogan | Your Agentic Chief Of Staff | 27 | 40 | Keep short under brand |
| `/` | Hero | Promise | Captures what was promised… | 234 | 220–240 | Long; mobile wraps; keep ≤240 |
| `/` | Hero | Primary CTA | Start your workspace | 20 | 28 | |
| `/` | Hero | Secondary CTA | See how it works | 16 | 28 | |
| `/` | Problem | H2 | Work does not stall… | 88 | 100 | Two sentences OK |
| `/` | Problem | Body | A request sits… | 309 | 280 | Slightly cut |
| `/` | Problem | Aside | Company OS is the agentic… | 175 | 200 | |
| `/` | Flow | H2 | Six beats… | 41 | 55 | |
| `/` | Flow | Lead | The product is not… | 190 | 200 | |
| `/` | Flow | Step body | (each) | ~90–180 | 160 | 6-col rail: keep tight |
| `/` | Channels | Card title | Daily prompts… | ~45 | 55 | |
| `/` | Channels | Card body | (each) | ~280–350 | 320 | 3-col cards |
| `/` | Modes | H2 | Not one industry… | 71 | 90 | |
| `/` | Modes | Mode body | (each) | ~90–120 | 140 | 5 cards |
| `/` | Audience | H2 | Project managers get… | 96 | 110 | |
| `/` | Audience | Point | (each) | ~60–120 | 120 | |
| `/` | Ribbon | Title | Commitments that close | ~25–45 | 50 | |
| `/` | Ribbon | Body | (each) | ~120–280 | 220 | |
| `/` | Statement | H2 | Less chasing. More closing. | 27 | 40 | |
| `/` | CTA | H2 | Put an agentic… | 46 | 55 | |
| `/` | CTA | Body | Create a workspace… | 118 | 140 | |
| `/` | Footer | Blurb | Captures commitments… | 106 | 140 | |
| Meta | title | Title | Company OS — … | 45 | 60 | Remove em dash |
| Meta | description | Desc | Company OS is… | ~175 | 160 | Trim |

---

## Voice (preserve and sharpen)

Representative lines:
- "Work does not stall because people forget tasks. It stalls because waiting is invisible."
- "Six beats. One continuous operating loop."
- "Escalate with context — no chasing, no stress pile-on." (punctuation to fix)
- "It is not a scorecard for promotion or discipline."
- "Less chasing. More closing."
- "Answer once. Get help, not heat."

Adjectives: calm, specific, operational, anti-chase, governed. Not hype SaaS.

---

## Current visitor flow

1. Land on `/` hero → Start workspace OR See how it works (`#how`)
2. Scroll problem → flow → narrative → modes → audience → ribbons → statement → CTA
3. Nav anchors: `#how`, `#teams`, `#reports`, `#product`
4. Footer → Privacy / Terms / Signup / Login
5. Dead ends: Privacy and Terms have "other" cross-link but no product CTA back to signup beyond LegalPage chrome (check LegalPage). No FAQ. No secondary content pages.

Primary CTA ladder today: Get started / Start your workspace / Create your workspace → all `/signup`. Secondary: See how it works → `#how`.
