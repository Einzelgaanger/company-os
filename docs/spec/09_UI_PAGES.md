# 09 — UI: Routes, Pages, Components, Copy

## 9.1 Route map

| Path | Page | Access | Layout |
|---|---|---|---|
| `/login` | Sign in | Public | Auth |
| `/login/sso` | SSO domain entry | Public | Auth |
| `/signup` | Create organization | Public | Auth |
| `/forgot-password`, `/reset-password` | Password recovery | Public | Auth |
| `/invite/:token` | Accept invite | Public (token) | Auth |
| `/mfa/enroll`, `/mfa/verify` | TOTP | Authenticated | Auth |
| `/onboarding/*` | Wizard, 10 steps org / 5 steps user | Authenticated | Onboarding |
| `/dashboard` | Dashboard (role-scoped) | All | App |
| `/projects` | Project list | All (scoped) | App |
| `/projects/new` | Create project | Manager+ | App |
| `/projects/:id` | Project detail | All (scoped) | App |
| `/projects/:id/settings` | Project settings, milestones | Manager+ | App |
| `/commitments` | Commitment list | All (scoped) | App |
| `/commitments/:id` | Commitment thread | Scoped | App |
| `/review` | Items needing human review | Manager+ | App |
| `/escalations` | Escalation queue | Scoped | App |
| `/escalations/:id` | Escalation detail | Scoped | App |
| `/team` | People directory | Manager+ | App |
| `/team/:id` | One person's work items | Manager+ (scoped) | App |
| `/surveys/current` | Answer the live survey | All | App |
| `/surveys` | Survey cycle history (aggregates) | Admin/Owner | App |
| `/surveys/:id/review` | Approve generated questions | Admin/Owner | App |
| `/reports` | Report archive | Scoped | App |
| `/reports/:id` | Report view | Scoped | App |
| `/integrations` | Connections | All (own) / Admin (org) | App |
| `/integrations/:provider/callback` | OAuth return | Authenticated | Blank |
| `/notifications` | Notification centre | All | App |
| `/settings/profile` | Personal settings | All | App |
| `/settings/my-data` | **What Loop knows about me** | All | App |
| `/settings/organization` | Org profile, timezone, hours | Admin/Owner | App |
| `/settings/people` | Invite & manage users | Admin/Owner | App |
| `/settings/teams` | Teams | Admin/Owner | App |
| `/settings/ownership-map` | Escalation routing | Admin/Owner | App |
| `/settings/data-governance` | Exclusion rules | Admin/Owner | App |
| `/settings/sso` | SSO & SCIM | Admin/Owner | App |
| `/settings/messaging` | WhatsApp status, quota, quality | Admin/Owner | App |
| `/settings/reports` | Recipients & schedule | Admin/Owner | App |
| `/settings/security` | Audit log, retention, DSRs | Admin/Owner | App |
| `/settings/compliance` | DPIA record, notice version, attestation | Admin/Owner | App |
| `/settings/billing` | Plan & seats | Owner | App |

---

## 9.2 Design system

**Direction:** a calm control room, not a busy dashboard. The product's entire promise is *"you don't have to watch everything — Loop tells you what matters."* The interface must embody that: mostly quiet, with colour reserved for genuine signal. Resist the urge to fill space with widgets.

**Colour tokens**
| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0F1B2D` | Primary text, sidebar |
| `--slate` | `#4B5768` | Secondary text |
| `--teal` | `#17806F` | Primary actions, brand, links |
| `--amber` | `#C87F17` | At risk |
| `--red` | `#B3402B` | Overdue, escalated |
| `--green` | `#3E8E5B` | On track, done |
| `--bg` | `#F7F8FA` | App background |
| `--surface` | `#FFFFFF` | Cards |
| `--border` | `#E4E8ED` | Hairlines |

**Type**
- Display: **Poppins** Semibold — page titles and empty-state headlines only.
- UI: **Inter** — everything else. Chosen over a display face for legibility in dense table rows.
- Data: **JetBrains Mono** — timestamps, IDs, percentages, phone numbers.

**Status convention:** green on track · amber at risk · red overdue or escalated · grey no active items. **Always paired with a text label** — colour alone fails accessibility and prints badly.

**Signature element:** the six-step loop (Detect → Track → Check → Nudge → Escalate → Report) as a ring, used exactly twice: the onboarding progress indicator, and the `/dashboard` empty state. Once understood, it is never repeated decoratively.

**Components:** shadcn/ui primitives re-skinned via tokens. Do not hand-roll what a primitive covers.

**Quality floor, not negotiable:** responsive to 375px, visible keyboard focus, `prefers-reduced-motion` respected, all interactive elements ≥44px touch target, every table has a keyboard-navigable row.

---

## 9.3 Page specifications

Template for each: **Purpose → Components → Data → Actions → Empty → Loading → Error.**

### `/dashboard`
- **Purpose:** what needs attention right now, scoped to role.
- **Components:** four stat cards (Open · At risk · Overdue · Escalated); "Needs your attention" list; recent activity feed; (Manager+) team status grid; (Admin) connection health strip.
- **Data:** Member — own items only. Manager — own + direct reports. Admin/Owner — org-wide plus project health summary.
- **Actions:** stat card → filtered `/commitments`; "Send a check-in" (Manager+); dismiss an activity item.
- **Empty:** `[C-DASH-EMPTY]` with the loop ring illustration and a "Connect your tools" CTA.
- **Loading:** skeleton matching the four-card layout. Never a full-page spinner.
- **Error:** `[C-ERR-GENERIC]` with Retry; the rest of the page still renders.

### `/projects` · `/projects/:id`
- List: sortable table — Name · Client · Owner · Progress (bar + %) · Health · Open · Overdue. Filter chips for status and health.
- Detail tabs: **Commitments** · **Milestones** · **Meetings** · **Timeline** · **Progress** (how the % was computed, with the confidence marker from `08_REPORTING.md` §8.2 — showing the working is what makes the number trusted).
- Actions: add commitment, link a meeting, edit milestones, change owner/status.

### `/commitments` · `/commitments/:id`
- List: Title · Project · Owner (Manager+ only) · Due · Status · Priority · Progress. Default sort: overdue, then at-risk, then due date.
- **Detail is the most important page in the product.** Sections:
  1. Header — title, status, priority, due, owner, requester
  2. **Source panel** — provenance: which meeting/email, when, the excerpt, and a link. *Visible only to users in the source's `visibility_user_ids`* (see `04_INTEGRATIONS.md` §4.5).
  3. **Check-in thread** — chat-style, every outbound and inbound message with timestamps and delivery state
  4. **Escalation history** — who, when, why, and the exact context that was sent
  5. **Event timeline** — from `commitment_events`
- Actions: mark done · update progress · send check-in now (Manager+) · escalate now (Manager+) · reassign · edit due date · flag as not-a-commitment (feeds the eval set).

### `/review`
- **Purpose:** the human-in-the-loop queue. Low-confidence extractions, unresolved owners, injection-flagged sources, commitments whose owner is outside the source's visibility set.
- **Components:** card list, each showing the extracted item beside its source excerpt, with the specific reason it needs review.
- **Actions:** Confirm (activates it, starts check-ins) · Edit then confirm · Discard (feeds the eval set) · Reassign owner.
- **Empty:** "Nothing needs review. Loop is confident about everything it's found."
- This page is what makes autonomous extraction safe. It must be pleasant to work through, not a punishment.

### `/escalations` · `/escalations/:id`
- List sorted by longest open. Detail renders the frozen `context_snapshot`: original commitment, requester, owner, last three exchanges, elapsed SLA, source link.
- Actions: Acknowledge (notifies requester) · Resolve (requires a one-line note, which is sent to the requester via `confirm_resolved`) · Re-route to someone else.
- **Empty:** `[C-ESC-EMPTY]` — "Nothing escalated. Everything's moving on its own."

### `/team` · `/team/:id`
- Directory: Name · Role · Team · Open items · Overdue · Last check-in response · WhatsApp status.
- Person page: their **work items only**. Commitments, check-in history, projects.
- **Explicitly absent, by design (C-1):** no score, no rating, no ranking, no productivity graph, no response-rate comparison against peers. If a stakeholder asks for one, the answer is in `00_START_HERE.md` §0.2.
- A short factual line is permitted: *"Responded to 4 of 5 check-ins in the last 14 days"* — a coordination fact, not an evaluation.

### `/settings/my-data`
- **Purpose:** GDPR/Kenya DPA transparency (C-3). This page is a hard requirement.
- **Components:** what Loop reads for this person (connections + sources); their commitments; their full message history; their survey responses; the notice version they accepted and when; current retention windows.
- **Actions:** Export everything (JSON + PDF) · Request correction · Request erasure · Delete my survey responses · Turn off WhatsApp check-ins.
- Requests create `dsr_requests` rows with a 30-day due date and notify admins.

### `/settings/data-governance`
- Exclusion rules table: Type · Value · Scope · Reason · Added by · Date. Add/remove.
- **"Test a rule"** input: paste a subject line, sender, or meeting title and see whether it would be excluded and by which rule. Admins do not trust invisible filters; make the filter visible.
- Below: count of items excluded in the last 30 days by rule (proof the filter is working).

### `/settings/ownership-map`
- Table: Category · Match keywords · Scope (project/team/all) · Primary owner · Backup · SLA hours · Order.
- Rules evaluate top-down; first match wins. Drag to reorder.
- **"Test routing"**: enter a sample blocker description and see which category and person it would route to. This is the highest-value debugging tool in the product — escalation going to the wrong person destroys trust faster than anything else.
- **Empty:** `[C-OWNMAP-EMPTY]`.

### `/settings/messaging`
- Current Meta tier, quality rating, today's send count against cap, 7-day opt-out and block rate with the 2%/3% thresholds marked.
- Template registry with per-template Meta approval status.
- Per-user opt-in state, with counts of not-verified / opted-out.
- When Loop has auto-throttled a tenant, this page explains exactly why in plain words.

### `/settings/security`
- Audit log table with filters (actor, action, date, target). CSV export.
- Retention controls per data class.
- Open DSR queue with due dates.
- Active sessions, revocable.
- "Export all organization data" (Owner) · "Delete organization" (Owner, double-confirm with the org name typed).

### `/settings/compliance`
- Read-only record of the onboarding attestation: who attested, when, lawful basis, DPIA status and document link, works-council status, notice version and publication date.
- Link to templates in `/docs/compliance/`.
- **"Publish an updated employee notice"** — bumps the version and re-prompts every user at next login.

---

## 9.4 Copy deck

| ID | Text |
|---|---|
| `C-DASH-EMPTY` | Nothing to show yet. Connect your meeting tool and Loop will start tracking commitments automatically. |
| `C-ERR-GENERIC` | Something went wrong loading this. Try again. |
| `C-COMMIT-EMPTY` | Nothing owed right now. Loop adds items here automatically from your meetings. |
| `C-ESC-EMPTY` | Nothing escalated. Everything's moving on its own. |
| `C-REVIEW-EMPTY` | Nothing needs review. Loop is confident about everything it's found. |
| `C-OWNMAP-EMPTY` | Add at least one category so Loop knows who to route blockers to. Until then, escalations go to the requester's manager. |
| `C-SURVEY-SUPPRESSED` | Not enough responses to report on this cycle without identifying individuals. |
| `C-LASTOWNER` | This is the only Owner on the account. Assign another Owner before changing this role. |
| `C-DISCONNECT` | Disconnect {provider}? Loop will stop reading new data from this source. Items already tracked stay. |
| `C-WHATSAPP-OFF` | Check-ins are off for you. Loop won't message you, and your work items stay visible here. |
| `C-CONN-BROKEN` | {provider} needs reconnecting. Loop hasn't been able to read new data since {when}. |

**Voice rules:**
- Sentence case. No exclamation marks. No "Oops."
- A button's verb and its resulting toast use the same word: "Escalate now" → "Escalated."
- Errors say what happened and what to do, in the interface's voice, never apologizing on a person's behalf.
- Empty states are invitations, not dead ends.
- Never describe people in system terms. "Waiting on a reply" not "user unresponsive."

---

## 9.5 Notifications

In-app bell plus optional email. Never WhatsApp for product notifications — that channel is reserved for check-ins, and diluting it costs quota and attention.

| Trigger | Recipient | Channel |
|---|---|---|
| Escalation assigned to you | Assignee | In-app + WhatsApp (`escalation_notify`) |
| Your escalation was acknowledged | Requester | In-app + WhatsApp |
| Weekly report ready | Recipients | Email |
| Connection broken | Connection owner + admins | In-app + email |
| Items awaiting review > 10 | Admins | In-app |
| Survey questions awaiting approval | Admins | In-app + email |
| Opt-out rate above 2% | Admins | In-app + email |
| DSR received | Admins | In-app + email |
| New device sign-in | The user | Email |
