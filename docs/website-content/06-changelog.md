# Changelog: website content revamp

Format: page | section | before → after | reason (gap) | capability IDs

## Docs (Phases 1–5)
- Created `docs/website-content/00` through `05`. No product copy changes in those commits' scope until Phase 7.

## Commit: brand + meta
| Page | Section | Before | After | Reason | Caps |
|---|---|---|---|---|---|
| brand | promise | Long em-dash hero promise; Telegram-era framing | Product definition with Chat + preferred channel + operating picture | Outdated, Muddy (G1,G2,G7) | C1,C4,C5,C9,C11 |
| brand | world | Em dash | Colon | Style (Rule 8) | n/a |
| index.html | title/desc/OG/Twitter | Em dashes; Telegram-era | Colon titles; Chat-aware descriptions; ≤160 desc | Style, Outdated (G8,G1) | C4,C5 |
| index.html | JSON-LD | None | Organization + SoftwareApplication | AI search readiness | n/a |

## Commit: homepage
| Page | Section | Before | After | Reason | Caps |
|---|---|---|---|---|---|
| `/` | `#how` anchor | On problem section | On six-beat flow; problem uses `#problem` | Flow break (G12) | n/a |
| `/` | FLOW Check | Telegram primary, WhatsApp/email fallback | Chat default; Telegram/WhatsApp when linked | Outdated, Oversold (G1,G5,G6) | C4,C5,C6,C7 |
| `/` | FLOW Detect | Meetings, chat, and mail | Meetings and chat + review gate | Undersold (G3) | C2,C3 |
| `/` | FLOW Escalate/Report | Em dashes / Oxford commas | Colon / no Oxford | Style | C9,C11 |
| `/` | CHANNELS | Channel-agnostic + em dashes | Chat named; punctuation fixed | Undersold, Style | C4,C5,C8,C9,C11 |
| `/` | MODES / AUDIENCE / RIBBONS | Telegram/email primary; em dashes | Chat-first; WhatsApp when connected | Outdated | C4,C5,C7 |
| `/` | CTA band | Category clever headline | Outcome headline; Chat in body | Generic (G9) | C4 |
| `/` | Footer | Features; old blurb | Product; Chat-aware blurb | Inconsistent (G10) | C4 |
| `/` | Ribbon imgs | Empty alt | Alt = ribbon title | A11y | n/a |
| `/` | Metrics | 6 / 1 / 0 | Unchanged (structural, not invented customers) | Trust (G11) | n/a |

## Commit: legal
| Page | Section | Before | After | Reason | Caps |
|---|---|---|---|---|---|
| Privacy | intro + collect messages | Telegram primary; em dashes | Chat default; linked channels; email for notices/reports | Outdated (G15) | C4,C5,C6,C7 |
| Privacy | body punctuation | Em dashes / Oxford commas | Colons / no Oxford in touched strings | Style | n/a |
| Terms | intro + AI + check-ins | Em dashes; WhatsApp-only template note | Colon; Chat or linked channels | Outdated, Style | C3,C4 |

## Commit: llms.txt
| Asset | Before | After | Reason |
|---|---|---|---|
| `public/llms.txt` | Missing | Product definition + canonical URLs | Phase 9.4 |

## Moves logged
- `id="how"` moved from `mk-problem` to `mk-flow` so "How it works" nav matches the six-beat section.
