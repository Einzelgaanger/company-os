# 04 — The Flow Engine

## 4.1 Why the object changes

v2's core object was a commitment with a status. That models **work**. It does not model **waiting**, and waiting is where the time goes.

The operations argument: unmanaged, invisible queues are the root cause of slow knowledge work. Organizations manage timelines instead of queues, and controlling work-in-progress and queue length is far more effective than maintaining precise schedules. The corollary that matters for Loop: **queue length is a leading indicator; cycle time is a lagging one.** A product that reports cycle time reports history. A product that reports queues reports the future.

The original friction that started this project makes the point. A data request took five days; the work in it was two hours. v2 records one commitment, "share SharePoint data", status overdue. v3 records an item that entered `waiting_external` on day one, changed owner twice, aged 4.2 working days, and consumed 60% of its project's buffer. Only the second version tells anyone what to do.

---

## 4.2 The waiting state machine

Every commitment is in exactly one state at all times, and every transition is recorded.

| State | Meaning | Clock |
|---|---|---|
| `proposed` | Extracted, not yet confirmed | Not counted |
| `ready` | Confirmed, owner assigned, not started | Counts toward queue age |
| `active` | Someone is working on it now | Counts toward touch time |
| `waiting_internal` | Blocked on another person inside the tenant | **Counts toward waiting** |
| `waiting_external` | Blocked on a client, vendor, or third party | **Counts toward waiting** |
| `waiting_decision` | Blocked on a decision, not a task | **Counts toward waiting** |
| `waiting_dependency` | Blocked on another commitment | **Counts toward waiting** |
| `review` | Done by the owner, awaiting acceptance | **Counts toward waiting** |
| `done` | Accepted | Clock stops |
| `cancelled` | Not happening | Excluded from all metrics |

**The three waiting-flavour states matter separately** because they route differently: `waiting_internal` escalates to an internal owner, `waiting_external` escalates to whoever holds the relationship, `waiting_decision` escalates to the decision-maker. v2 collapsed all of these into `blocked`, which is why its escalation logic needed a keyword-matching ownership map to guess.

**Schema:**

```sql
-- Replaces the old status column entirely.
ALTER TABLE commitments
  ADD COLUMN flow_state text NOT NULL DEFAULT 'proposed'
    CHECK (flow_state IN ('proposed','ready','active','waiting_internal','waiting_external',
                          'waiting_decision','waiting_dependency','review','done','cancelled')),
  ADD COLUMN flow_state_since timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN waiting_on_user_id uuid REFERENCES users(id),
  ADD COLUMN waiting_on_external_name text,
  ADD COLUMN waiting_on_commitment_id uuid REFERENCES commitments(id),
  ADD COLUMN cost_of_delay_band text NOT NULL DEFAULT 'standard'
    CHECK (cost_of_delay_band IN ('critical','high','standard','low')),
  ADD COLUMN committed_date date,          -- replaces due_date; see §4.6
  ADD COLUMN first_ready_at timestamptz;   -- start of queue age

-- Every transition. Immutable. This table is the product's memory.
CREATE TABLE flow_events (
  id                bigserial PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  commitment_id     uuid NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  from_state        text,
  to_state          text NOT NULL,
  waiting_on_user_id uuid REFERENCES users(id),
  waiting_on_external_name text,
  duration_seconds  int,          -- time spent in from_state; null on first event
  working_seconds   int,          -- duration excluding non-working hours; see §4.4
  source            text NOT NULL CHECK (source IN ('checkin','manual','extraction','system','corroboration')),
  actor             text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flow_events_tenant_commitment ON flow_events(tenant_id, commitment_id, created_at DESC);
CREATE INDEX flow_events_tenant_created ON flow_events(tenant_id, created_at DESC);
```

**Rule:** `commitments.flow_state` is a denormalized cache of the latest `flow_events` row. Write both in one transaction. Every metric in this file derives from `flow_events`, never from the cache — the cache exists only to make list queries fast.

---

## 4.3 The waiting register

The single most valuable screen in the product, and it does not exist in v2. Every item currently in a waiting state, ordered by cost.

```sql
SELECT c.id, c.title, c.flow_state, c.flow_state_since,
       c.waiting_on_user_id, c.waiting_on_external_name,
       c.cost_of_delay_band, p.name AS project,
       working_seconds_since(c.flow_state_since, s.timezone, s.work_days,
                             s.quiet_hours_start, s.quiet_hours_end) AS waiting_seconds
FROM commitments c
LEFT JOIN projects p ON p.id = c.project_id
CROSS JOIN tenant_settings s
WHERE c.flow_state LIKE 'waiting%' OR c.flow_state = 'review'
ORDER BY cod_weight(c.cost_of_delay_band) * waiting_seconds DESC;
```

Grouped two ways, toggled by the user:
- **By who is holding it** — "6 items waiting on the data team, 41 working days total." This is the view that produces action.
- **By project** — which work is starving.

`waiting_on_external_name` is deliberately a free-text field for people who are not Loop users. Most waiting in a consultancy is on someone outside the tenant, and a product that can only track internal people misses the majority of the delay.

---

## 4.4 Working time, not wall time

Every duration in Loop is **working seconds**, computed against the tenant's timezone, working days, and quiet hours. An item that becomes blocked at 17:00 Friday and is unblocked at 09:00 Monday waited zero working time, and reporting it as 64 hours would be a lie that destroys the metric's credibility on first read.

Implement once, in `packages/shared/src/workingTime.ts`:

```ts
export function workingSecondsBetween(
  start: Date, end: Date, settings: TenantTimeSettings
): number
```

Every consumer uses it. No consumer computes a duration with subtraction. Add a lint rule or a review checklist item — this is the kind of thing that gets reimplemented three times and diverges.

Public holidays: `tenant_holidays (tenant_id, holiday_date, name)`, editable at `/settings/organization`. Seed Kenya's public holidays for the pilot. Do not attempt to infer them.

---

## 4.5 Cost of delay

Reinertsen's central argument is that without a cost of delay you cannot prioritize sensibly, because every other proxy — utilization, on-time percentage, due date order — optimizes something that is not economic value.

Loop cannot compute a true cost of delay; that needs business context it does not have. It can do the thing that captures most of the value for a fraction of the effort: **four bands, set by a human, applied consistently.**

| Band | Weight | Meaning | Typical |
|---|---|---|---|
| `critical` | 8 | Every day of delay costs money or a commitment to a third party | Client deliverable with a contractual date, regulatory filing |
| `high` | 4 | Delay blocks other people or work | A dependency several items sit behind |
| `standard` | 2 | Normal work | Default |
| `low` | 1 | Delay costs little | Internal improvement, nice-to-have |

**Set by:** the project owner at project level (inherited by its commitments), overridable per commitment by a manager. Default `standard`. Never inferred by a model — an invented economic weight is worse than an honest default.

**Used for:** ordering the waiting register, ordering the "needs attention" list, choosing which items get a check-in when a person is at their daily message cap, and ordering escalations.

**The one derived signal:** an item that other items depend on is automatically promoted one band while those dependencies are open, because blocking others is a real cost. Show the reason in the UI: "raised to High — 3 items are waiting on this."

---

## 4.6 Committed dates, not due dates

Rename `due_date` to `committed_date` throughout, and change its semantics.

Individual task deadlines produce two well-documented behaviours: work is not begun until the deadline approaches, and work expands to fill the time allotted. Both destroy the margin the deadline was supposed to protect.

**So:**
- A `committed_date` exists only when someone **actually committed to it** with another party. `due_date_source` becomes `committed` | `none`. There is no `inferred`. **A model never produces a date.** (v2 already forbade invented dates; this makes it structural by removing the field the model could populate.)
- Most items have **no date** and that is normal, not a data-quality problem. They are ordered by cost-of-delay band and queue age.
- Project-level dates are protected by a **buffer** (§4.7), not by per-task dates.

This removes the largest single source of false "overdue" states, which in v2 would have generated nagging about dates nobody agreed to — the fastest possible route to the product being muted.

---

## 4.7 Project buffers and the fever chart

Critical-chain project management's answer to schedule uncertainty is to stop defending every task date and instead aggregate protection into a **project buffer**, then monitor **buffer consumption against chain completion**. The standard visual is the fever chart: percentage of buffer consumed on one axis, percentage of the chain complete on the other, with green, amber, and red zones.

This is the right project health visual for Loop, for three reasons: it warns earlier than a percentage, it is **about the project rather than a person**, and it degrades gracefully when data is thin.

**Schema:**
```sql
ALTER TABLE projects
  ADD COLUMN target_end_date date,
  ADD COLUMN buffer_days numeric(6,2),          -- explicit, or derived per below
  ADD COLUMN buffer_consumed_days numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN chain_complete_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN fever_zone text NOT NULL DEFAULT 'unknown'
    CHECK (fever_zone IN ('green','amber','red','unknown'));
```

**Buffer sizing.** If the admin sets `buffer_days`, use it. Otherwise derive: 50% of the working days between the project's start and `target_end_date` is the classical rule, but Loop has better information — use **the project's own observed waiting time over the last 30 days, annualized to the remaining span**, floored at 15% and capped at 50% of the remaining span. Show which method was used. A buffer derived from this project's actual behaviour is far more credible to the person reading it than a textbook fraction.

**Chain completion.** Weighted by cost-of-delay band across non-cancelled commitments:
```
chain_complete_pct = Σ(weight × completion) / Σ(weight)
completion = 1.0 if done; 0 if proposed/ready; 0.5 if active or review;
             last self-reported value if waiting (waiting does not advance completion)
```
Note the last clause: **waiting never increases completion.** That is the whole point.

**Buffer consumption.** Working days of aggregate waiting on the project's critical items (bands `critical` and `high`), divided by `buffer_days`.

**Zones.** The standard diagonal bands:
- `green` — consumption below chain completion
- `amber` — consumption between 1× and 1.5× chain completion
- `red` — consumption above 1.5× chain completion, or above 90% regardless

**Rendered as** a scatter with the current point plus the last 8 weekly points as a trail. The trail is what makes it readable — the direction of travel matters more than the position.

**`unknown`** when a project has fewer than 3 commitments or no `target_end_date`. Say "not enough signal yet" rather than showing a misleading green.

---

## 4.8 Aging work-in-progress

The second core chart, and the one that replaces the four count cards.

A scatter: **x = queue age in working days**, **y = cost-of-delay band**, one dot per open item, coloured by flow state. Percentile lines at p50, p85, and p95 of historical age at completion.

Why this and not a burndown: it shows the *distribution*, which is where the outliers live, and outliers are what needs action. A count of "12 open" tells you nothing about whether one of them has been sitting for three weeks.

Reinertsen's WIP principles that this operationalizes: make WIP continuously visible, constrain it to control cycle time, and watch for the point where high loading produces a sudden collapse in output.

**WIP limits.** Optional, per project or per person, set by an admin at `/settings/organization`. When exceeded, Loop does **not** block anything — it surfaces a soft signal on `/flow`: "This team has 34 items in progress against a limit of 25. Cycle time typically rises sharply above this point." Advisory, never enforcement. Loop is an instrument, not a gate.

---

## 4.9 The metrics that go on the hero screen

Replacing Open / At risk / Overdue / Escalated:

| Metric | Definition | Why it earns its place |
|---|---|---|
| **Waiting now** | Sum of working days across all items currently in a waiting state, expressed in **team-days** | The headline. One number that says how much of the organization's time is sitting still. |
| **Longest wait** | The single oldest waiting item, with who holds it | Names the worst case. Always actionable. |
| **Flow debt trend** | Waiting-now vs the same figure 7 days ago, as ▲/▼ with the delta | Direction of travel beats level |
| **Unblocked this week** | Count of items that left a waiting state | The positive counterpart. A screen that only shows problems trains people to avoid it. |

Below the fold: aging WIP scatter, waiting register (top 10), project fever grid.

**Deliberately absent:** any count of items per person, any completion percentage per person, any response-rate figure. See `00_OVERHAUL_BRIEF.md` §0.6.

---

## 4.10 Corroboration

Self-reported state is the primary signal. Objective signals corroborate it. Divergence flags **the item**, never the person.

| Objective signal | Source | What it corroborates |
|---|---|---|
| A file matching the commitment appeared in shared storage | Drive/OneDrive metadata | `review` or `done` claims |
| A meeting on the topic occurred | Calendar | `waiting_decision` resolution |
| A dependency commitment closed | Internal | `waiting_dependency` |
| A reply arrived from the external party | Email metadata (phase 5) | `waiting_external` |
| No flow event in 10+ working days on an `active` item | Internal | Staleness |

**On divergence** — e.g. an item reported `active` for 12 working days with no events and no artifact — set `needs_look = true` and surface it in `/review` under "Might be stale", with the neutral framing: *"This has been active for 12 days with no updates. Still moving?"*

**Never:** compute a per-person accuracy score, show divergence counts by person, or use divergence as an escalation trigger on its own. Divergence is a prompt for a human to look, and nothing else. Recording it per person is precisely the attributional measurement that makes people start managing the metric instead of the work.
