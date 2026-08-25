# 07 — Design System

## 7.1 The design thesis

Loop's promise is *"you don't have to watch everything — I'll tell you what matters."* An interface that is dense, colourful, and busy contradicts that promise on sight, no matter what the copy says.

So the aesthetic is **a quiet instrument**. Mostly neutral. Colour is scarce and therefore meaningful. When something is coloured, it is because a human needs to do something.

The failure mode to design against is the operational dashboard that shows forty live metrics and gets ignored within a month. An executive will not monitor a screen with forty live metrics — and once a screen produces mostly noise, people stop reading the parts that were signal.

---

## 7.2 The colour collision the audit found

Current tokens: `--forest #0E1F1A`, `--lime #D3F36B`, `--gold #F0C419`. Lime is **brand and primary and accent**. Gold is **brand accent and "at risk"**.

This is the specific error the visualization literature warns about: never use a semantic status colour for branding. If the brand colour also means "warning", the user cannot tell a button from an alarm, and every screen carries a low-level false signal.

Two further problems:
- **Lime on white fails contrast.** `#D3F36B` against white is roughly 1.5:1. It cannot carry text or be a primary button surface. The audit found the CTA overridden to forest, which is the codebase telling you the token is wrong.
- **Red/green status pairs.** Around 99% of colour blindness is red-green, and a dashboard where red means blocked and green means fine reduces both to similar muddy tones for those users.

---

## 7.3 The rule: brand and status are disjoint sets

**No colour appears in both sets. Ever.** This is checkable and must be enforced by a token test.

### Brand set — identity and interaction only

| Token | Hex | Use |
|---|---|---|
| `--brand-ink` | `#0E1F1A` | Primary text, sidebar, dark surfaces. *(Forest retained — it is good, and it is the only brand colour that currently works.)* |
| `--brand-primary` | `#0E1F1A` | Primary buttons. Dark on light — high contrast, calm, and it never competes with status. |
| `--brand-accent` | `#D3F36B` | Lime. **Decorative only** — logo, marketing, illustration, focus glow. Never a surface behind text. Never a status. |
| `--brand-muted` | `#5B6B66` | Secondary text |
| `--surface` | `#FFFFFF` | Cards |
| `--bg` | `#F6F8F7` | App background |
| `--border` | `#E2E8E5` | Hairlines |

Lime survives as brand identity — it is distinctive and the marketing site uses it well — but it loses every functional role. Primary actions become dark forest on light, which is high-contrast, quiet, and unambiguous.

### Status set — flow states only, on a blue-to-orange axis

The primary status contrast runs **blue → orange**, not green → red, because that axis survives all three common colour-vision deficiencies. Red is retained **only** for the genuinely critical tier, always with an icon and a label.

| Token | Hex | Flow meaning | Icon | Label |
|---|---|---|---|---|
| `--status-moving` | `#2D7A9E` | `active` — someone is working on it | ▶ | Moving |
| `--status-ready` | `#7C8B99` | `ready` — queued, untouched | ○ | Ready |
| `--status-waiting` | `#C77D18` | `waiting_*` — the state Loop exists to surface | ⏸ | Waiting |
| `--status-review` | `#5B7C99` | `review` — awaiting acceptance | ◐ | In review |
| `--status-attention` | `#B3402B` | Escalated, or waiting beyond the red threshold | ▲ | Needs attention |
| `--status-done` | `#3E7A5B` | `done` | ✓ | Done |

Green appears **only** for `done`. It is never a health signal, never "on track", never reassurance. This is deliberate: green-as-reassurance is the visual grammar of watermelon reporting, and removing it from the vocabulary removes the invitation to produce it.

**Every status is rendered with all three of: colour, icon, text label.** Colour alone is never sufficient, in any component, including compact table cells and sparklines. Enforce it structurally — `<StatusChip state={...} />` is the only way to render a status, and it always emits the triad.

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

The audit found four families loaded: IBM Plex Mono, Inter, Plus Jakarta Sans, Space Grotesk. Four is at least one too many and costs real load time.

**Keep three, each with a job:**

| Role | Family | Weights | Used for |
|---|---|---|---|
| Display | Plus Jakarta Sans | 600, 700 | Page titles, empty-state headlines, marketing. Sparingly. |
| Interface | Inter | 400, 500, 600 | Everything else — tables, forms, labels, body |
| Data | IBM Plex Mono | 500 | Durations, dates, counts, IDs, phone numbers |

**Drop Space Grotesk.** It overlaps Plus Jakarta Sans and earns nothing.

**Mono for durations is a deliberate signal.** "4.2 working days" in mono reads as a measurement rather than prose, and it aligns in columns. Loop is an instrument; its numbers should look like instrument readings.

**Scale:** 12 / 14 / 16 / 20 / 24 / 32 / 48. Body 14. Table cells 14. Nothing below 12.

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
