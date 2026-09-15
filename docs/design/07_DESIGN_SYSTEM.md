# 07 — Design System

## 7.1 The design thesis

Loop's promise is *"you don't have to watch everything — I'll tell you what matters."* An interface that is dense, colourful, and busy contradicts that promise on sight, no matter what the copy says.

So the aesthetic is **a quiet instrument**. Mostly neutral. Colour is scarce and therefore meaningful. When something is coloured, it is because a human needs to do something.

The failure mode to design against is the operational dashboard that shows forty live metrics and gets ignored within a month. An executive will not monitor a screen with forty live metrics — and once a screen produces mostly noise, people stop reading the parts that were signal.

---

## 7.2 Historical colour collision (resolved)

An earlier audit found lime serving as brand, primary and accent at once, and gold serving as both brand accent and “at risk.” Gold has been **deleted** from the brand set; warning chrome now draws from the `waiting` status family (`--status-waiting*`). Brand and status remain disjoint.

Remaining invariant:

- **Lime on white fails contrast** (~1.5:1). It cannot be body text on a light surface. Enforced by `pnpm check:tokens`.
- **Status axis is blue → orange**, not green → red, for colour-vision deficiency. Red is reserved for `attention`. Green appears only as `done` (completed work items — never people).

---

## 7.3 The rule: brand and status are disjoint sets

**No colour appears in both sets. Ever.** Enforced by `pnpm check:tokens` (rules 1–4).

### Brand set — identity and interaction only

| Token | Hex | Use |
|---|---|---|
| `--brand-ink` / `--brand-primary` | `#0E1F1A` | Primary text, sidebar, dark surfaces, app primary buttons |
| `--brand-accent` | `#D3F36B` | Lime — see lime CTA rule below |
| `--brand-accent-wash` | `#F4FBE3` | Soft lime wash for selected / identity hover |
| `--brand-muted` | `#5B6560` | Secondary text — **the only muted grey** |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-raised` | `#F8F8F7` | Raised soft fills |
| `--bg` | `#F5F5F3` | App background (neutral, not green-tinted) |
| `--border` | `#E5E5E2` | Hairlines |

**Lime `#D3F36B` is the brand accent. It is never a status and never body text.**

**Marketing and auth surfaces** (`.loop-site`, auth marketing pane): lime may fill the single primary CTA per viewport, the logo node, section rules and identity accents. Text on lime is always forest `#0E1F1A`.

**App surfaces** (portal, sidebar, content canvas): lime never fills an interactive control. App primary action is forest. Lime appears only as focus ring, avatar chip and small identity accents.

**Never anywhere:** lime as text on a light surface, lime as a status, lime as a chart series, lime to indicate a person's performance.

**Accent budget:** Lime covers roughly five percent of any marketing viewport. One filled CTA, plus identity. If lime appears on three separate elements in one viewport it has stopped being a signal.

### Status set — flow states only, on a blue-to-orange axis

The primary status contrast runs **blue → orange**, not green → red, because that axis survives all three common colour-vision deficiencies. Red is retained **only** for the genuinely critical tier, always with an icon and a label.

| Token | Hex | Flow meaning | Icon | Label |
|---|---|---|---|---|
| `--status-moving` | `#2D7A9E` | `active` — someone is working on it | ▶ | Moving |
| `--status-ready` | `#7B837E` | `ready` — queued, untouched (neutral grey — dormant) | ○ | Ready |
| `--status-waiting` | `#C77D18` | `waiting_*` — the state Company OS exists to surface; also warning banners | ⏸ | Waiting |
| `--status-review` | `#5B7C99` | `review` — awaiting acceptance | ◐ | In review |
| `--status-attention` | `#B3402B` | Escalated, or waiting beyond the red threshold | ▲ | Needs attention |
| `--status-done` | `#3E7A5B` | `done` | ✓ | Done |

Green appears **only** for `done`. It is never a health signal, never "on track", never reassurance. This is deliberate: green-as-reassurance is the visual grammar of watermelon reporting, and removing it from the vocabulary removes the invitation to produce it.

**Every status is rendered with all three of: colour, icon, text label.** Colour alone is never sufficient, in any component, including compact table cells and sparklines. Enforce it structurally — `<StatusChip state={...} />` is the only way to render a status, and it always emits the triad.

### Warning chrome

Banners that formerly used gold (`#F0C419` / wash / text) now use `waiting` tint / ink / mark. Do not reintroduce a brand gold family.

### Fever chart zones — the one place a traffic pattern is correct

| Zone | Token | Hex |
|---|---|---|
| Green | `--fever-ok` | `#3E7A5B` |
| Amber | `--fever-watch` | `#C77D18` |
| Red | `--fever-act` | `#B3402B` |

Position on the chart carries the meaning; colour reinforces. Each zone is also labelled directly on the plot, so the chart is readable in greyscale.

---

## 7.4 Perception rules

These are not stylistic preferences. They are how the eye works, and violating them costs comprehension.

**One pre-attentive channel per signal.** Colour, position, size, shape, and motion are processed before conscious attention. Use exactly one to carry the primary signal on any given screen, or they compete and none reads. On `/flow`, that channel is **position** (age on the x-axis). Colour is secondary, and size is not used at all.

**Position beats colour and area for quantity.** Position along a common scale is perceived more accurately than any other encoding. So: aligned horizontal bars, always. **No donuts, no gauges, no pie charts anywhere in Loop.** A gauge showing "68% complete" is both less readable and more likely to be a fiction than a bar with a scale.

**Grey is the default.** A screen where everything is coloured is a screen where nothing is. Target: on a healthy tenant's `/flow`, under 10% of pixels carry status colour.

**Redundant encoding, always.** Never colour alone.

**Actionable and informational look different.** An informational element says something changed. An actionable one says a person must act. Actionable elements always carry a verb button and sit above informational ones; informational elements never use `--status-attention`.

---

## 7.5 Typography

**Three families, each with a job:**

| Role | Family | Weights | Used for |
|---|---|---|---|
| Display | **Instrument Sans** (`--font-display`) | 400, 500, 600 | Marketing headlines, brand wordmarks. Weight 600 reserved for marketing display. |
| Interface | **Inter** (`--font-sans`) | 400, 500 | App UI, body, tables, forms. Prefer 400/500 only in-app. |
| Data | **IBM Plex Mono** (`--font-mono`) | 400, 500 | Durations, dates, counts, IDs, phone numbers |

Plus Jakarta Sans and Space Grotesk are **gone**. Do not reload them.

**Mono for durations is a deliberate signal.** "4.2 working days" in mono reads as a measurement rather than prose, and it aligns in columns. Company OS is an instrument; its numbers should look like instrument readings.

**Display treatment:** H1 marketing weight 600, letter-spacing `-0.025em`, line-height `1.05`. H2 weight 600, letter-spacing `-0.015em`. Body Inter 400, line-height `1.6`, measure capped at ~68ch.

**Scale:** 12 / 14 / 16 / 20 / 24 / 32 / 48. Body 14. Table cells 14. Nothing below 12.

---

## 7.5b Marketing chrome — anti-tell list

These are where a templated “AI SaaS” feel actually comes from. Enforce in review:

- No tracked-out all-caps eyebrow labels above headings. Sentence case, or no label.
- No `→` appended to button or link text. The button says what happens.
- No meta strings joined with middle dots.
- No accenting a single word of a headline in lime. The headline is one colour.
- No numbered markers (01 / 02 / 03) unless the content is genuinely a sequence.
- No identical rounded cards with identical soft shadows as the section grammar. Cards are interaction containers only. Prefer bordered rows and full-bleed bands.
- No fade-and-slide-up entrance on every section. One orchestrated page-load moment maximum.
- Hero photography must be real work environments, not stock desks.

---

## 7.6 The waiting-time component

The product's signature number deserves a dedicated component, because it appears on the flow screen, the waiting register, every commitment, and the report, and it must be identical everywhere.

```
┌─────────────────────────┐
│  ⏸  Waiting             │   ← StatusChip: icon + colour + label
│  4.2 working days       │   ← mono, --status-waiting when past amber
│  on the data team       │   ← who holds it, never "because of X"
└─────────────────────────┘
```

**Rules:**
- Always "working days", never raw elapsed time. The unit is stated every time — an unlabelled number invites the wrong reading.
- Under one day: "since this morning" / "since yesterday". Precision below a day is false precision.
- The holder is named as a **role or team** where possible ("the data team"), and as a person only when the person is the right point of contact. This is a small choice with a large effect on how the screen feels: it reads as a map of the system rather than a list of who is failing.
- Colour crosses to `--status-waiting` at the coordination mode's amber threshold and to `--status-attention` at red. Never before — a component that is orange from minute one teaches people to ignore orange.

---

## 7.7 Charts

The audit found **no chart library installed at all**. Loop is a measurement instrument with no visualization capability. Add **Recharts** — it is already the assumed default in the environment and covers everything below.

| Chart | Where | Encoding |
|---|---|---|
| **Aging WIP scatter** | `/flow` | x = working days in queue, y = cost-of-delay band, dot colour = flow state, dashed percentile lines at p50/p85/p95 |
| **Fever chart** | `/projects/:id` | x = chain complete %, y = buffer consumed %, zone bands, 8-week trail |
| **Waiting-by-holder bars** | `/waiting` | Horizontal bars, aligned baseline, sorted descending by total waiting days |
| **Flow debt sparkline** | `/flow` header, report | 12-week line, single hue, no axis, current value labelled |
| **Cumulative flow** | `/reports/:id` | Stacked area by flow state over 12 weeks |

**Absent by policy:** pies, donuts, gauges, radar, 3D anything, dual-axis charts.

**Every chart must be legible in greyscale** and must carry a one-line plain-language caption stating what it shows and what a reader should do about it. A chart nobody can interpret is decoration.

---

## 7.8 Vocabulary map

Coordination mode substitutes these at render time (`03_COORDINATION_MODES.md` §3.5). Keys are fixed; values vary by mode.

| Key | `mutual_adjustment` | `standardized_process` | `standardized_skills` |
|---|---|---|---|
| `waiting` | Waiting on | Held at step | Awaiting |
| `past_date` | Past its date | SLA breached | Past committed date |
| `owner` | Owner | Step owner | Responsible |
| `escalate` | Ask someone else | Raise to process owner | Refer to coordinator |
| `checkin` | Check-in | Status point | Update request |
| `blocked` | Waiting | Stalled | Awaiting input |

Never render a raw key. Every user-facing string that could vary goes through `t(key)` with the tenant's profile.

---

## 7.9 Motion

Minimal and functional. This is a tool people open twenty times a day.

- Transitions 150ms ease-out. Nothing slower than 200ms.
- **No entrance animations on data.** A number that counts up delays comprehension for decoration.
- Skeletons match the final layout's shape exactly, so nothing shifts on load.
- Motion carries meaning only when an item **changes state while the user is watching** — a brief highlight on the row, then still.
- `prefers-reduced-motion: reduce` disables all of it.

---

## 7.10 Component inventory

Existing Radix/CVA primitives in `src/components/ui/*` are kept. Additions and changes:

| Component | Status | Note |
|---|---|---|
| `StatusChip` | **New, mandatory** | The only way to render a flow state. Emits colour + icon + label. |
| `WaitingTime` | **New** | §7.6 |
| `CostOfDelayBadge` | **New** | Four bands, with the auto-promotion reason on hover |
| `FeverChart` | **New** | |
| `AgingScatter` | **New** | |
| `WaitingRegisterTable` | **New** | Groupable by holder or project |
| `NudgeFeedbackBar` | **New** | The two-tap useful/not-useful control |
| `StatCard` | **Repurposed** | Now flow metrics, not counts |
| `StatusBadge` | **Removed** | Superseded by `StatusChip` — delete it so it cannot be used |
| `AutonomyPill` | **Changed** | Read-only display of the last server sweep; no client engine |
| `DataTable`, `PageHeader`, `ConfirmationModal`, `EmptyState`, `ErrorState`, dialogs | Kept | |

---

## 7.11 Accessibility floor

Non-negotiable, checked in CI with `axe-core`:

- WCAG 2.2 AA contrast on all text and all UI boundaries
- Every status conveyed by icon + text + colour
- Full keyboard operation; visible focus rings using `--brand-accent` (lime finally earns a functional job)
- Touch targets ≥44px
- Charts have text alternatives — every chart is accompanied by the underlying figures in an accessible table, collapsed by default
- Palette verified against deuteranopia, protanopia and tritanopia simulation before any token change ships
