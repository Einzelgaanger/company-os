# 08 — Pages and Controls

## 8.1 Route map

**Changes from the audit's inventory are marked.** `NEW`, `CHANGED`, `REMOVED`.

| Path | Page | Access | Note |
|---|---|---|---|
| `/` | Marketing | Public | Kept |
| `/login` | Sign in | Public | Google button ships working or is removed |
| `/login/sso` | SSO | Public | Ships working or is **REMOVED** |
| `/signup` | Create org | Public | |
| `/forgot-password`, `/reset-password` | Recovery | Public | Ship working or **REMOVED** |
| `/invite/:token` | Accept invite | Token | Server-validated, hashed token |
| `/mfa/enroll`, `/mfa/verify` | TOTP | Auth | Real TOTP or **REMOVED** |
| `/onboarding/organization` | Org name, timezone | Owner | |
| `/onboarding/compliance` | Attestation | Owner | **CHANGED** — persists to DB |
| `/onboarding/coordination` | Coordination mode | Owner | **NEW** |
| `/onboarding/notice` | Transparency notice | All | **CHANGED** — persists to DB |
| `/onboarding/profile` | Name, phone | All | |
| `/onboarding/whatsapp` | Opt-in + OTP | All | **CHANGED** — real OTP |
| `/onboarding/connections` | Connect tools | All | **CHANGED** — real OAuth |
| `/onboarding/exclusions` | Governance rules | Owner | **CHANGED** — persists to DB |
| `/onboarding/routing` | Ownership map | Owner | |
| `/onboarding/people` | Invites | Admin+ | |
| `/onboarding/complete` | Done | All | |
| **`/flow`** | **Flow overview** | All (scoped) | **NEW — the hero screen** |
| **`/waiting`** | **Waiting register** | All (scoped) | **NEW** |
| `/my-work` | Personal queue + check-ins | All | **CHANGED** — merges `/inbox` and personal dashboard |
| `/dashboard` | → redirect to `/flow` | | **CHANGED** |
| `/inbox` | → redirect to `/my-work` | | **REMOVED** |
| `/projects` · `/projects/new` · `/projects/:id` · `/projects/:id/settings` | Projects | Scoped | Detail gains a **Flow** tab with the fever chart |
| `/commitments` · `/commitments/:id` | Items | Scoped | **CHANGED** — flow states, not statuses |
| `/review` | Human-in-the-loop queue | Manager+ | **CHANGED** — adds "Might be stale" |
| `/escalations` · `/escalations/:id` | Escalations | Scoped | |
| `/team` · `/team/:id` | People | Manager+ | **CHANGED** — all per-person metrics removed |
| `/surveys` · `/surveys/current` · `/surveys/:id/review` | Surveys | Admin / All / Admin | **CHANGED** — `/surveys/current` gains a role guard |
| `/reports` · `/reports/:id` | Reports | Manager+ scoped | |
| `/integrations` | Connections | All / Admin | **CHANGED** — real OAuth |
| `/notifications` | Notification centre | All | |
| `/settings/profile` · `/my-data` | Personal | All | |
| `/settings/organization` · `/people` · `/roles` · `/teams` · `/sso` | Admin | Admin+ | |
| **`/settings/coordination`** | Coordination mode | Admin+ | **NEW** |
| `/settings/routing` | Ownership map | Admin+ | Renamed from `ownership-map` |
| `/settings/governance` | Exclusions | Admin+ | **CHANGED** — persists |
| `/settings/messaging` | WhatsApp health | Admin+ | **CHANGED** — real quota data |
| **`/settings/nudge-quality`** | Alert precision | Admin+ | **NEW** |
| `/settings/compliance` · `/security` · `/reports` | Admin | Admin+ | |
| `/settings/billing` | Plan | Owner | |
| `*` | Not found | | |

**Fix the audit's nav/route mismatch:** the sidebar shows Surveys to manager+ while the route requires admin. Make both **admin+**. Add a role guard to `/surveys/current` — it currently has none.

---

## 8.2 Authorization matrix

Enforced in `preHandler` per `06_ENFORCEMENT.md` §6.1. The UI mirrors it; the UI is never the enforcement.

| Action | Member | Manager | Admin | Owner |
|---|:--:|:--:|:--:|:--:|
| View own items, check-ins, messages | ✅ | ✅ | ✅ | ✅ |
| Update own item's flow state | ✅ | ✅ | ✅ | ✅ |
| View `/flow` scoped to self | ✅ | ✅ | ✅ | ✅ |
| View `/waiting` scoped to self | ✅ | ✅ | ✅ | ✅ |
| View `/flow` and `/waiting` for own team | — | ✅ | ✅ | ✅ |
| View org-wide flow | — | — | ✅ | ✅ |
| Create/edit projects, milestones | — | Own team | ✅ | ✅ |
| Reassign an item's owner | — | Own team | ✅ | ✅ |
| Trigger a manual check-in | — | Own team | ✅ | ✅ |
| Escalate manually | — | Own team | ✅ | ✅ |
| Acknowledge/resolve escalation | Assigned | Team | ✅ | ✅ |
| Confirm/discard review items | — | Own team | ✅ | ✅ |
| Invite users, set roles | — | — | ✅ (not Owner) | ✅ |
| Configure routing, governance, coordination | — | — | ✅ | ✅ |
| Approve survey questions | — | — | ✅ | ✅ |
| View reports | — | Team-scoped | ✅ | ✅ |
| Audit log, retention, DSRs | — | — | ✅ | ✅ |
| Export all data, delete org, billing | — | — | — | ✅ |

**No role, at any level, can retrieve a per-person performance metric — because none exists.**

---

## 8.3 App shell

Sidebar, in order: **Flow · Waiting · My work · Projects · Items · Review** (manager+) **· Escalations · Team** (manager+) **· Reports** (manager+) **· Surveys** (admin+) **· Integrations · Settings**.

Top bar: tenant name, notification bell → `/notifications`, avatar menu (Profile, My data, Sign out), `AutonomyPill` (read-only: "Last sweep 12 min ago").

Banners, dismissible, persisted server-side per user:
- Broken connection → "Fix" → `/integrations`
- WhatsApp not verified → "Verify" → `/settings/profile`
- Tenant in `provisioning` → "Finish setup" → onboarding (**not dismissible**)
- A nudge trigger auto-suspended → "Review" → `/settings/nudge-quality`

Mobile: bottom tab bar — Flow · Waiting · My work · More.

---

## 8.4 `/flow` — the hero screen

**Purpose:** how much of the organization's time is sitting still, and where.
**Replaces:** `/dashboard` and its four count cards.
**Data:** `GET /flow/summary?scope=self|team|org`, `GET /flow/aging`, `GET /waiting?limit=10`, `GET /projects/fever`.

**Layout, top to bottom:**
1. Scope switcher (Me / My team / Organization — only the scopes the role permits)
2. Four flow metrics (`04_FLOW_ENGINE.md` §4.9): Waiting now · Longest wait · Flow debt trend · Unblocked this week
3. **Needs a human decision** — escalations unactioned past their SLA, and items where automated routing has been exhausted. Capped at 5.
4. Aging WIP scatter with percentile lines
5. Waiting register preview — top 10 by cost-of-delay × age
6. Project fever grid — one small fever chart per active project
7. WIP advisory strip, only when a limit is exceeded

| Control | Type | Label | Position | Enabled | Handler | Result | Confirm | Success | Error |
|---|---|---|---|---|---|---|---|---|---|
| Scope switcher | Segmented | Me / My team / Organization | Header | Per role | `setScope` | Refetch, URL param | — | — | ErrorState in place |
| Waiting now card | Card, clickable | "Waiting now — 41 team-days" | Row 1 | Always | Navigate | `/waiting` | — | — | — |
| Longest wait card | Card, clickable | "Longest — 9 days, data team" | Row 1 | Always | Navigate | `/waiting?sort=age` | — | — | — |
| Flow debt trend | Card + sparkline | "▲ 6 days vs last week" | Row 1 | Always | Navigate | `/reports` | — | — | — |
| Unblocked card | Card, clickable | "Unblocked this week — 12" | Row 1 | Always | Navigate | `/commitments?resolved=7d` | — | — | — |
| Decision row → Open | Button | "Open" | Row 3 | Always | Navigate | `/escalations/:id` | — | — | — |
| Decision row → Take this | Button | "Take this" | Row 3 | If routable to viewer | `POST /escalations/:id/take` | Reassign + notify raiser | Inline confirm | Toast "Taken." | Toast + row stays |
| Scatter dot | Interactive point | — | Row 4 | Always | Click | `/commitments/:id` | — | — | — |
| Scatter filter | Multi-select | Flow state | Row 4 | Always | `setStates` | Client filter | — | — | — |
| Waiting row → Nudge | Button | "Nudge" | Row 5 | Manager+, holder opted in | `POST /commitments/:id/nudge` | Sends `unblock_request` | — | Toast "Nudge sent." | Toast with reason (opt-out, quiet hours, cap) |
| Waiting row → Escalate | Button | "Escalate" | Row 5 | Manager+ | `POST /commitments/:id/escalate` | Manual escalation | Dialog: shows who it routes to | Toast "Escalated to {name}." | Toast |
| "See all waiting" | Link | "See all 34" | Row 5 | Always | Navigate | `/waiting` | — | — | — |
| Fever tile | Card, clickable | Project name + zone | Row 6 | Always | Navigate | `/projects/:id?tab=flow` | — | — | — |
| WIP advisory → Dismiss | Icon button | ✕ | Row 7 | Admin+ | `POST /flow/wip/dismiss` | Hides 7 days | — | — | — |

**States:**
- **Loading** — skeletons matching the exact final layout. No spinner.
- **Empty (new tenant, no data)** — loop-ring illustration, "Nothing's waiting. Connect your meeting tool and Loop will start tracking what's owed." → `/integrations`.
- **Empty (healthy tenant)** — different copy and this matters: "Nothing is waiting right now. 12 items moved this week." A healthy org must not see a screen that looks broken.
- **Partial** — each panel fails independently with its own retry. One dead endpoint never blanks the page.
- **Error** — `C-ERR-GENERIC` with Retry.
- **Permission** — scopes above the role are absent from the switcher, not disabled.

**Responsive:** below 768px, cards stack 2×2, scatter becomes a sorted list, fever grid becomes a horizontal scroller.

---

## 8.5 `/waiting` — the waiting register

**Purpose:** every item currently waiting, and who holds it. The screen a manager opens instead of chasing.
**Data:** `GET /waiting?group=holder|project&scope=...`

| Control | Type | Label | Enabled | Handler | Result | Confirm | Success | Error |
|---|---|---|---|---|---|---|---|---|
| Group toggle | Segmented | By holder / By project | Always | `setGroup` | Regroup, URL param | — | — | — |
| Scope switcher | Segmented | Me / Team / Org | Per role | `setScope` | Refetch | — | — | — |
| Sort | Select | Cost × age / Age / Project | Always | `setSort` | Reorder | — | — | — |
| Filter | Multi-select | Waiting type (internal/external/decision/dependency) | Always | `setTypes` | Filter | — | — | — |
| Group header | Collapsible | "Data team — 6 items, 41 working days" | Always | Toggle | Expand/collapse | — | — | — |
| Nudge all in group | Button | "Nudge all 6" | Manager+ | `POST /waiting/nudge-batch` | One bundled message per holder | Dialog listing recipients and what each receives | Toast "6 nudges sent." | Per-recipient failure list |
| Row → title | Link | Item title | Always | Navigate | `/commitments/:id` | — | — | — |
| Row → Nudge | Button | "Nudge" | Manager+ | `POST /commitments/:id/nudge` | `unblock_request` | — | Toast | Toast with reason |
| Row → Escalate | Button | "Escalate" | Manager+ | `POST /commitments/:id/escalate` | Escalation | Dialog with route preview | Toast | Toast |
| Row → Reassign | Button | "Reassign" | Manager+ | Dialog + `PATCH` | Change waiting-on | Dialog | Toast "Reassigned." | Toast |
| Row → Not waiting | Button | "Not waiting" | Owner or manager+ | `PATCH /commitments/:id/flow` | → `active` | — | Toast "Updated." | Toast |
| Export | Button | "Export CSV" | Manager+ | `GET /waiting/export` | Download | — | — | Toast |

**Empty:** "Nothing is waiting. That's the goal." — with the current count of items moving.
**Bar chart** above the table when grouped by holder: horizontal, aligned, sorted descending by total waiting days.

---

## 8.6 `/my-work`

**Purpose:** one place for a person's own items and check-ins. Merges the audit's `/inbox` and personal dashboard.

**Sections:** Needs a reply from you (open check-ins) · Waiting on others (their items blocked elsewhere) · Moving (their active items) · Recently closed.

| Control | Type | Label | Enabled | Handler | Result | Success |
|---|---|---|---|---|---|---|
| Check-in card → Waiting on someone | Button | "Waiting on someone" | Always | `POST /checkins/:id/reply` | Opens who-field | Card advances |
| Who field | Combobox | "Who or what?" | After above | Search roster + free text | Sets waiting-on | Toast "Got it. I'll chase that." |
| Check-in card → I'm on it | Button | "I'm on it" | Always | `POST /checkins/:id/reply` | → `active` | Toast "Thanks." |
| Check-in card → It's done | Button | "It's done" | Always | `POST /checkins/:id/reply` | → `review` | Confirm dialog: close or notify |
| Free reply | Input + send | "Or say more…" | Always | `POST /checkins/:id/reply` | Classified | Toast |
| Nudge feedback | Two buttons | "Was this useful? Yes / Not really" | On ~1 in 5 | `POST /nudges/:id/feedback` | Records | Inline "Thanks." |
| Waiting row → Chase | Button | "Chase this" | Always | `POST /commitments/:id/nudge` | `unblock_request` | Toast |
| Waiting row → It cleared | Button | "It cleared" | Always | `PATCH /commitments/:id/flow` | → `active` | Toast |
| Item row | Link | Title | Always | Navigate | `/commitments/:id` | — |
| Snooze | Icon + menu | "Snooze — 1 day / 3 days / next week" | Always | `PATCH /commitments/:id/snooze` | Suppresses check-ins | Toast "Snoozed to {date}." |

**Empty:** "Nothing needs you right now."
**Deliberately absent:** any personal statistic — no completion rate, no response rate, no streak. See brief §0.6.

---

## 8.7 `/commitments/:id`

**Sections:** header · source panel · flow timeline · check-in thread · escalation history · dependencies.

| Control | Type | Label | Enabled | Handler | Result | Confirm |
|---|---|---|---|---|---|---|
| Back | Link | "Items" | Always | Navigate | `/commitments` | — |
| Flow state | Select | Current state | Owner or manager+ | `PATCH /commitments/:id/flow` | Writes `flow_events` | — |
| Waiting-on | Combobox | "Waiting on…" | When state is `waiting_*` | `PATCH` | Sets holder | — |
| Cost of delay | Select | 4 bands | Manager+ | `PATCH` | Reprioritizes | — |
| Committed date | Date | "Committed date (optional)" | Manager+ | `PATCH` | Sets/clears | — |
| Owner | Combobox | "Owner" | Manager+ | `PATCH` | Reassign + notify | Dialog |
| Project | Combobox | "Project" | Manager+ | `PATCH` | Relink | — |
| Mark done | Button | "Mark done" | Owner or manager+ | `POST /commitments/:id/done` | → `review` → `done` | — |
| Send check-in | Button | "Send check-in now" | Manager+ | `POST /commitments/:id/checkin` | Sends | Shows exact message first |
| Nudge holder | Button | "Nudge {holder}" | Manager+, waiting | `POST .../nudge` | `unblock_request` | — |
| Escalate | Button | "Escalate" | Manager+ | `POST .../escalate` | Escalation | Dialog with route preview |
| Add dependency | Button + search | "Blocked by…" | Manager+ | `POST .../dependencies` | Links; may auto-promote band | — |
| Remove dependency | Icon | ✕ | Manager+ | `DELETE` | Unlinks | — |
| Not a commitment | Button | "This isn't a commitment" | Manager+ | `POST .../reject` | Cancels + feeds eval set | Dialog |
| Source link | Link | "From {meeting}, {date}" | If viewer is in source visibility | Navigate | Transcript | — |
| Cancel | Button | "Cancel item" | Manager+ | `PATCH` | → `cancelled` | Dialog |

**Source panel visibility:** shown only to users in the source's `visibility_user_ids`. Others see "Created from a meeting you weren't part of." — never the excerpt.

**Flow timeline:** every `flow_events` row as a vertical timeline with working-time durations per segment. This is the page that makes waiting legible — it shows a five-day item as four days waiting and two hours working, which is the whole argument in one picture.

---

## 8.8 `/projects/:id`

Tabs: **Flow** (default) · Items · Milestones · Meetings · Timeline.

**Flow tab:** fever chart with 8-week trail · buffer figure with sizing method stated · waiting register scoped to the project · aging scatter scoped to the project.

| Control | Type | Label | Enabled | Handler | Result |
|---|---|---|---|---|---|
| Tabs | Tabs | 5 labels | Always | Route param | Switch |
| Edit project | Button | "Edit" | Manager+ | Navigate | `/projects/:id/settings` |
| Buffer method | Select | "Derived from waiting / Fixed days" | Manager+ | `PATCH` | Recompute |
| Buffer days | Number | "Buffer (working days)" | When Fixed | `PATCH` | Recompute |
| Target end date | Date | "Target end" | Manager+ | `PATCH` | Recompute |
| Fever point | Point | — | Always | Hover | Tooltip with that week's numbers |
| Add item | Button | "Add item" | Manager+ | Dialog | Creates |
| Link meeting | Button | "Link a meeting" | Manager+ | Dialog | Associates |
| Archive | Button | "Archive project" | Manager+ | `PATCH` | Hides from active | Dialog |

**Fever `unknown` state:** "Not enough signal yet — add a target date and at least 3 items." Never a misleading green.

---

## 8.9 `/review`

Two groups: **Needs confirming** (low-confidence extraction, unresolved owner, owner outside source visibility, injection-flagged) and **Might be stale** (corroboration divergence, `04_FLOW_ENGINE.md` §4.10).

| Control | Type | Label | Enabled | Handler | Result | Confirm |
|---|---|---|---|---|---|---|
| Card → Confirm | Button | "Confirm" | Manager+ | `POST /review/:id/confirm` | Activates, starts check-ins | — |
| Card → Edit & confirm | Button | "Edit & confirm" | Manager+ | Inline form | Corrects then activates | — |
| Card → Discard | Button | "Not a commitment" | Manager+ | `POST /review/:id/reject` | Cancels, feeds eval set | — |
| Owner combobox | Combobox | "Owner" | Manager+ | Inline | Resolves | — |
| Source excerpt | Expandable | "Show source" | If in visibility | Toggle | Reveals | — |
| Stale card → Still moving | Button | "Still moving" | Manager+ | `PATCH` | Clears flag, resets clock | — |
| Stale card → Ask the owner | Button | "Ask the owner" | Manager+ | `POST .../checkin` | Sends check-in | Shows message |
| Bulk confirm | Button | "Confirm all {n} high-confidence" | Manager+ | `POST /review/bulk-confirm` | Batch | Dialog listing items |

**Empty:** "Nothing needs review. Loop is confident about everything it's found."
This page must be pleasant to work through — it is the human-in-the-loop that makes autonomous extraction safe.

---

## 8.10 `/team` and `/team/:id`

**The audit's version violated brief §0.6.** It showed "Last check-in response" as a directory column.

**`/team` columns, exhaustively — nothing else may be added:** Name · Role · Team · Items in their queue · Items waiting on them.

Both counts are about **work location**, not performance. "Items waiting on them" is the one a manager acts on, and it is framed as a queue depth, not a failing.

**Explicitly forbidden columns:** response rate, on-time percentage, completion rate, average age of their items, any sortable performance-adjacent measure, any comparison across people.

**`/team/:id`** shows their items, grouped by flow state, and their waiting relationships. No metrics, no history graph, no score.

| Control | Type | Label | Enabled | Handler | Result |
|---|---|---|---|---|---|
| Search | Input | "Search people" | Always | Filter | — |
| Invite | Button | "Invite teammate" | Admin+ | Dialog | Creates invite |
| Row | Link | Name | Always | Navigate | `/team/:id` |
| Send check-in | Button | "Send check-in" | Manager+ | Dialog | Shows message, sends |
| Reassign item | Button | "Reassign" | Manager+ | Dialog | Moves item |
| Change role | Select | Role | Admin+ | `PATCH` | Updates | Inline confirm; blocked for last owner |

---

## 8.11 Settings

### `/settings/coordination` — NEW
Current mode with description · "Change mode" opens the three onboarding questions · preview panel showing exactly what changes (cadence, thresholds, escalation route, report sections) · Save with a confirmation dialog listing the changes.

### `/settings/routing`
Ordered rules: Category · Keywords · Scope · Primary · Backup · SLA hours. Drag to reorder; first match wins.
**"Test routing"** — paste a blocker description, see which rule matches and who it reaches. The highest-value debugging tool in the product, because a misrouted escalation costs more trust than a missed one.

### `/settings/governance`
**CHANGED — persists to `ingestion_exclusions`, not React state.**
Rules table with add/remove · "Test a rule" input · count of items excluded in the last 30 days per rule, which is the proof the filter is working.

### `/settings/nudge-quality` — NEW
Per trigger kind: precision, sent, rated, response rate, opt-out rate, status. 12-week trend. Suspended triggers with "Resume". Cadence controls. Threshold editors, because the people who receive the alerts should set the thresholds.

### `/settings/messaging`
**CHANGED — real data from `messaging_quota`.**
Current Meta tier · quality rating · today's sends vs cap · 7-day opt-out and block rate with the 2%/3% lines marked · template registry with Meta approval status · counts of not-verified and opted-out users. When Loop has auto-throttled the tenant, this page says so in plain words.

### `/settings/my-data`
Everything Loop holds on the viewer: sources read, their items, their full message history, their survey answers, notice version and date, retention windows.
Actions: Export JSON · Export PDF · Request correction · Request erasure · Delete my survey responses · Turn off WhatsApp check-ins.
Each creates a real `dsr_requests` row with a 30-day due date. **No toast-only actions on this page** — it is a legal surface.

### `/settings/compliance`
Read-only attestation record from the database: who attested, when, lawful basis, DPIA status and link, works-council status, notice version. "Publish updated notice" bumps the version and re-prompts everyone.

### `/settings/security`
Audit log with filters and CSV export · retention controls · DSR queue with overdue highlighting · active sessions with revoke · Export all data (Owner) · Delete organization (Owner, type the org name).

### `/settings/organization`
Name · timezone · working days · quiet hours · **public holidays** (`04_FLOW_ENGINE.md` §4.4) · default escalation SLA · optional WIP limits.

---

## 8.12 Every stub the audit found, resolved

| Stub | Resolution |
|---|---|
| Google sign-in toast | Wire it, or delete the button |
| SSO page | Wire WorkOS, or delete the route and its nav entry |
| Forgot/reset password | Wire to Supabase Auth, or delete the links |
| MFA enroll/verify | Real TOTP, or delete both routes |
| WhatsApp OTP shown on page | Real OTP via Twilio; never rendered |
| Resend OTP toast | Real resend with cooldown |
| Connections instant-connect | Real OAuth |
| Report "Regenerate" toast | `POST /reports/:id/regenerate` |
| Report PDF via `window.print()` | Server-rendered PDF, downloaded |
| Messaging approval in localStorage | `message_approvals` table |
| Governance rules in React state | `ingestion_exclusions` table |
| Compliance/notice in localStorage | `tenant_compliance`, `users` |
| Export org / delete org toasts | Real jobs with progress |
| DSR PDF export toast | Real render |
| SCIM in-memory map | Postgres-backed, or remove the endpoints until built |
| Survey answer storing `["submitted"]` | Store the actual answers |
| Email ingest 501 | Keep — correctly gated on CASA |
| C-1 / C-2 403 endpoints | Keep — these are correct and should stay |

**Rule for this table:** every row ships working or the affordance is removed. A button that lies about what the system does is worse than a missing feature, because it spends trust that has to be earned back.
