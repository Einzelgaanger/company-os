# Company OS — Full System & Screen-by-Screen Reference

**Purpose:** a complete walkthrough of the product as it exists in `src/`, page by page and control by control, so you can decide what to add, cut, or fix.
**Scope:** the React SPA (what a user actually touches), plus a map of which backend each screen talks to.
**Companion doc:** `COMPANY_OS_DOSSIER.md` covers architecture, data model, AI layer and ops. This doc covers the *surface*.

Every control listed below was read from source. Where a button does nothing useful in a given deployment mode, it says so.

---

## Table of contents

1. [How to read this document](#1-how-to-read-this-document)
2. [System shape in one page](#2-system-shape-in-one-page)
3. [Complete route map](#3-complete-route-map)
4. [The app shell (present on every signed-in page)](#4-the-app-shell)
5. [Public surface — marketing and legal](#5-public-surface)
6. [Authentication pages](#6-authentication-pages)
7. [Onboarding wizard](#7-onboarding-wizard)
8. [Core working pages](#8-core-working-pages)
9. [Settings](#9-settings)
10. [Shared dialogs and reusable controls](#10-shared-dialogs-and-reusable-controls)
11. [What each page actually calls (backend map)](#11-what-each-page-actually-calls)
12. [Review findings — bugs, dead ends, duplication](#12-review-findings)
13. [Candidate add / remove / merge list](#13-candidate-add--remove--merge-list)

---

## 1. How to read this document

**Roles** are a ladder: `member` < `manager` < `admin` < `owner` (`src/lib/types.ts`, `roleAtLeast`).
**Clearance** for sensitive data follows the role: member sees `internal`, manager sees `confidential`, admin and owner see `restricted` (`clearanceFor`).

**Three deployment modes** decide what is real on any given screen. This matters constantly, because several buttons change behaviour or go inert depending on the mode (`src/lib/db.ts`):

| Mode | Trigger | What the pages talk to |
|---|---|---|
| **Supabase (production)** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | Supabase Postgres directly, plus Edge Functions for launch readiness and OAuth |
| **Fastify API** | No Supabase vars, `VITE_API_URL` set | The `apps/api` service (flow endpoints, review queue, reports, SSO, approvals) |
| **Mock / demo** | Neither set | `localStorage` seeded demo org (ProDG Studios). Blocked in production builds unless `VITE_ALLOW_MOCK=1` |

Supabase wins over Fastify when both are set, deliberately, so a stray `VITE_API_URL` cannot hijack production.

**Labels used below**

- **Works everywhere** — the control functions in all three modes.
- **API-only** — needs `VITE_API_URL` (Fastify); inert or shows a message on the production Supabase path.
- **Edge-only** — needs Supabase Edge Functions.
- **Demo-only** — only does something against the local mock store.

---

## 2. System shape in one page

The product is a commitment-coordination loop, not a task board. The intended cycle:

```
meeting / chat  →  extract commitments  →  human review if unsure
                                              ↓
                        owner gets a check-in on Telegram / WhatsApp
                                              ↓
                  reply is classified: on track / blocked / done
                                              ↓
              blocked or silent → escalate to a routed owner with context
                                              ↓
                     daily & weekly leadership report with themes
```

The SPA is the operator console for that loop. Its information architecture splits into five zones:

1. **Flow zone** (`/flow`, `/waiting`, `/my-work`) — time-based view of where work is stuck. This is the product's distinctive part.
2. **Register zone** (`/commitments`, `/projects`, `/team`) — the conventional records.
3. **Decision zone** (`/review`, `/escalations`, `/notifications`) — things needing a human.
4. **Reporting zone** (`/reports`, `/surveys`, `/governance`) — output and oversight.
5. **Configuration zone** (`/settings/*`, `/integrations`) — setup, compliance, messaging, launch.

A deliberate design constraint appears repeatedly in the code comments: **no per-person performance metrics**. `Team.tsx`, `MyWork.tsx`, `Surveys.tsx` and `ReportDetail.tsx` all carry explicit code comments or on-screen disclaimers forbidding scores, rankings, completion rates and individual sentiment. If you review anything here, know this is load-bearing — it is the compliance story (EU AI Act high-risk deployer obligations), not decoration.

---

## 3. Complete route map

Source: `src/App.tsx`.

### Public (no login)

| Path | Page | Notes |
|---|---|---|
| `/` | `MarketingHome` | Full marketing site |
| `/privacy-policy` | `Privacy` | `/privacy` redirects here |
| `/terms-of-service` | `Terms` | `/terms` redirects here |
| `/login` | `Login` | Bounces to `/flow` if already signed in |
| `/login/sso` | `LoginSso` | WorkOS token landing page |
| `/signup` | `Signup` | Bounces if signed in |
| `/auth/callback` | `AuthCallback` | Google OAuth return |
| `/forgot-password` | `ForgotPassword` | |
| `/reset-password` | `ResetPassword` | |
| `/invite/:token` | `AcceptInvite` | |
| `*` | `NotFound` | |

### Onboarding (login required, no onboarding gate)

| Path | Page | Reached from |
|---|---|---|
| `/onboarding/organization` | `Organization` | Signup, or guard when user has no org |
| `/onboarding/compliance` | `Compliance` | Organization step, or guard (admins) |
| `/onboarding/notice` | `Notice` | Guard when notice not acknowledged |
| `/onboarding/coordination` | `Coordination` | **Nothing links here** — see findings |
| `/onboarding/profile` | `Profile` | Compliance / Notice |
| `/onboarding/connections` | `Connections` | Profile |
| `/onboarding/team` | `Team` | Connections (admins only) |
| `/onboarding/complete` | `Complete` | Connections / Team |

### Application (login + onboarding gate + shell)

| Path | Page | Minimum role |
|---|---|---|
| `/flow` | `Flow` | member |
| `/waiting` | `Waiting` | member |
| `/my-work` | `MyWork` | member |
| `/dashboard` → `/flow` | redirect | — |
| `/inbox` → `/my-work` | redirect | — |
| `/projects` | `Projects` | member |
| `/projects/new` | `ProjectNew` | manager |
| `/projects/:id` | `ProjectDetail` | member |
| `/projects/:id/settings` | `ProjectSettings` | manager |
| `/commitments` | `Commitments` | member |
| `/commitments/:id` | `CommitmentDetail` | member (plus clearance check) |
| `/review` | `ReviewQueue` | manager |
| `/team` | `Team` | manager |
| `/team/:id` | `TeamMember` | manager |
| `/escalations` | `Escalations` | member |
| `/escalations/:id` | `EscalationDetail` | member |
| `/reports` | `Reports` | manager |
| `/reports/:id` | `ReportDetail` | manager |
| `/reports/settings` → `/settings/reports` | redirect | — |
| `/surveys` | `Surveys` | **admin** |
| `/surveys/current` | `SurveyCurrent` | member |
| `/surveys/:id/review` | `SurveyReview` | admin |
| `/integrations` | `Integrations` | member |
| `/notifications` | `Notifications` | member |
| `/governance` | `Governance` | manager |
| `/settings` → `/settings/profile` | redirect | — |
| `/settings/profile` | `SettingsProfile` | member |
| `/settings/my-data` | `SettingsMyData` | member |
| `/settings/organization` | `SettingsOrganization` | admin |
| `/settings/people` | `SettingsRoles` (same file) | admin |
| `/settings/roles` | `SettingsRoles` | admin |
| `/settings/teams` | `SettingsTeams` | admin |
| `/settings/ownership-map` | `SettingsOwnershipMap` | admin |
| `/settings/data-governance` | `SettingsDataGovernance` | admin |
| `/settings/messaging` | `SettingsMessaging` | admin |
| `/settings/nudge-quality` | `SettingsNudgeQuality` | admin |
| `/settings/launch` | `SettingsLaunch` | admin |
| `/settings/sso` | `SettingsSso` | admin |
| `/settings/compliance` | `SettingsCompliance` | admin |
| `/settings/security` | `SettingsSecurity` | admin |
| `/settings/reports` | `ReportSettings` | admin |
| `/settings/billing` | `SettingsBilling` | owner |

**Orphaned file:** `src/pages/app/settings/SettingsCoordination.tsx` has no route at all, yet onboarding copy tells users to go to "Settings → Coordination".

### Guards

`src/components/auth/guards.tsx`:

- **`RequireAuth`** — spinner while loading, redirect to `/login` with the attempted location remembered.
- **`RequireOnboarding`** — runs four checks in order: has an org → org compliance attested → individual notice acknowledged → personal onboarding finished. Non-admins hitting an unattested org see a dead-stop message telling them to ask their admin. **Caveat:** the compliance and notice gates only enforce when `VITE_API_URL` is set (`useLegalGates` returns `enforced: false` otherwise), so on the production Supabase path they always pass.
- **`RequireRole`** — silently redirects to `/flow` if the role is too low. No "access denied" screen.
- **`RedirectIfAuthed`** — sends a signed-in visitor to the right next step instead of showing login/signup.

---

## 4. The app shell

File: `src/components/layout/AppLayout.tsx` (aliased as `PortalLayout`). Wraps every signed-in page.

### Desktop sidebar (≥1024px)

Dark forest panel with brand mark, org name, and the nav list. Items are filtered by role, so a member simply never sees the manager entries.

| Nav item | Goes to | Shown to |
|---|---|---|
| Flow | `/flow` | everyone |
| Waiting | `/waiting` | everyone |
| My work | `/my-work` | everyone |
| Projects | `/projects` | everyone |
| Commitments | `/commitments` | everyone |
| Review queue | `/review` | manager+ |
| Team | `/team` | manager+ |
| Escalations | `/escalations` | everyone |
| Reports | `/reports` | manager+ |
| Surveys | `/surveys` | manager+ *(but the route needs admin — bug)* |
| Governance | `/governance` | manager+ |
| Integrations | `/integrations` | everyone |
| Settings | `/settings/profile` | everyone |

Below the nav, a user chip shows initials, name and org, with two icon buttons:

| Control | Behaviour |
|---|---|
| Bell icon | Navigates to `/notifications`. Shows a dot when unread count > 0 (recounted on every route change) |
| Sign-out icon | Calls `signOut()` then navigates to `/login` |
| **Collapse** (bottom) | Toggles the sidebar to icon-only. Not persisted — resets on reload |

### Desktop top bar

| Control | Behaviour |
|---|---|
| Org name (left) | Text only, not a link |
| **Autonomy pill** | Dropdown showing whether server autonomy is on (from `org.settings.autonomy_enabled`) and when the last sweep ran. Admins and owners get a **Run a sweep now** item → `POST /admin/sweeps/run`. **API-only**: without `VITE_API_URL` it toasts "Connect VITE_API_URL to run server sweeps." The pill is explicitly read-only; the old in-browser engine was removed |
| Bell | `/notifications`, with unread dot |
| User chip | Navigates to `/settings/profile` |

### Mobile chrome (<1024px)

| Control | Behaviour |
|---|---|
| Hamburger | Opens a full-height drawer with the same nav plus a **Sign out** row |
| Bell | `/notifications` |
| Bottom tab bar | First three nav items (Flow, Waiting, My work) plus **More** |
| **More** | Opens a 3-column grid of the remaining nav items |

### Banners (above page content)

| Banner | Trigger | Controls |
|---|---|---|
| Connection issue | Any connection whose sync is stale or expired | "Fix in Integrations" link · X dismisses permanently via `localStorage` |
| Verify Telegram | Current user has no linked messaging | "Link in Profile" link → `/settings/profile` · X dismisses permanently |

Both dismissals are **permanent per browser** (`companyos.banner.*.dismissed`) — there is no way to bring them back.

### Page header

`src/components/layout/PageHeader.tsx` — lime tick, title, optional subtitle, and a right-aligned actions slot. Every page below uses it, and the "actions" listed per page are what lands in that slot.

---

## 5. Public surface

### `/` — Marketing home (`MarketingHome.tsx`, 532 lines)

A full marketing site, not a placeholder. Sections in order: hero, "the job" problem statement, the six-beat loop (Detect → Track → Check → Nudge → Escalate → Report), daily-operations narrative cards, coordination modes by company type, audience cards (project managers / operators / everyone), three image ribbons, a statement band with three metrics, a CTA band, and a footer.

| Control | Behaviour |
|---|---|
| Brand mark | Back to `/` |
| How it works / For teams / Reports / Product | Anchor scroll to `#how`, `#teams`, `#reports`, `#product` |
| **Sign in** | `/login` |
| **Get started** (nav) | `/signup` |
| Hamburger (mobile) | Opens a slide-over sheet with the same links |
| **Start your workspace** (hero) | `/signup` |
| **See how it works** (hero) | Anchors to `#how` |
| **Create your workspace** (CTA) | `/signup` |
| Footer links | Product anchors, `/login`, `/signup`, `/privacy-policy`, `/terms-of-service` |

Scroll behaviour: the nav progressively gains blur and shadow; sections fade in on intersection, respecting `prefers-reduced-motion`.

### `/privacy-policy` and `/terms-of-service`

Both render through `LegalPage.tsx`: kicker, title, effective date, intro, a sticky table of contents built from the section list, the article body, and a footer. Controls are navigation only — TOC anchors, a cross-link to the other document, and Home / Sign in / Get started in the nav.

---

## 6. Authentication pages

All auth screens share `AuthLayout` + `AuthCard` (centred card with title, description, footer link).

### `/login`

| Control | Behaviour |
|---|---|
| Email field | Required, `autoComplete="email"` |
| Password field | Required, with an eye icon that toggles visibility |
| **Forgot password?** | `/forgot-password` (sits beside the password label) |
| **Sign in** | Calls `signIn()`. On success plays the `AuthLaunch` animation then navigates to `/flow`. On failure shows inline red text and a toast |
| **Continue with Google** | Supabase `signInWithOAuth` with `redirectTo=/auth/callback`. Throws a clear error in mock mode |
| **Prefill ProDG demo credentials (dev)** | Only rendered when `import.meta.env.DEV`. Fills the demo email and password |
| **Create an account** (footer) | `/signup` |

### `/signup`

| Control | Behaviour |
|---|---|
| **Continue with Google** | Same OAuth path, placed above the form |
| Full name / Email | Required |
| Password (strength meter) | `PasswordStrengthField`; the submit button stays disabled until `checkPassword().strong` |
| **Create account** | `signUp()` then navigates to `/onboarding/organization` |
| Terms / Privacy links | Open the legal pages |
| **Sign in** (footer) | `/login` |

### `/auth/callback`

No controls in the happy path — it exchanges the OAuth code for a session, then navigates to `/flow` (the guards then decide the real destination). Shows a spinner, times out after 10 seconds with "Sign-in timed out", and on error shows the message plus a **Back to sign in** link.

### `/login/sso`

Reads `accessToken` / `refreshToken` from the query string, stores them, and hard-redirects to `/flow`. Shows "Completing SSO…". An `error` param is toasted instead.

### `/forgot-password`

Email field plus **Send reset link** → `supabase.auth.resetPasswordForEmail` with a redirect to `/reset-password`. Success swaps the form for a neutral "if an account exists…" message. In mock mode it explains that recovery needs the hosted backend. **Back to sign in** in the footer.

### `/reset-password`

Password strength field plus **Save changes** → `updateUser({password})`, then signs the user out and sends them to `/login` with a toast. Disabled until the password is strong.

### `/invite/:token`

Looks the token up in the local store. If invalid, shows "Invite not found" with a **Go to sign in** link. If valid, pre-fills name and a read-only email, asks for a strong password, and **Accept invite** → `signUp({inviteToken})` → `/onboarding/profile`.

> **Note:** the token lookup reads `store.all("users")` — the mock store — so invite acceptance is demo-path logic as written.

---

## 7. Onboarding wizard

Shared chrome: `OnboardingLayout` shows a progress ring and a five-dot rail labelled **Organization · Compliance · Profile · Connections · Team**.

### Step 1 — `/onboarding/organization`

Organization name field with a live slug preview (`companyos.app/your-org`). **Continue** calls `createOrganization()` then goes to `/onboarding/compliance`. Users who already belong to an org are redirected straight to `/onboarding/notice`.

### Step 2 — `/onboarding/compliance` (admin gate)

A blocking legal attestation. Five checkboxes, all required, plus a DPO email:

| Checkbox | Statement |
|---|---|
| Lawful basis | Legitimate interest under GDPR Art. 6(1)(f); consent is not valid in employment |
| DPIA | A Data Protection Impact Assessment has been or will be completed |
| Works council | Employee representatives consulted where local law requires |
| Notice | Employees will be informed before their data is processed |
| No high-risk use | Company OS must not drive promotion, discipline or termination decisions |

**Attest and continue** is disabled until all five are ticked and the DPO email contains `@`. It writes to `tenant_compliance` via the API, then navigates to `/onboarding/profile`. The page states that `high_risk_use_prohibited` stays true and cannot be turned off in the UI.

> **Important:** the write only happens when `apiConfigured()`. On the Supabase production path the attestation is collected and then discarded.

### Individual notice — `/onboarding/notice`

A plain-language transparency notice covering what the system reads, what it asks, what managers see, what leadership sees, retention (12 months), and the user's rights. One checkbox — "I've read this" — enables **Continue**, which records the acknowledgement (`users.notice_acknowledged_at`, API-only) and moves to `/onboarding/profile`.

### Coordination — `/onboarding/coordination` (orphaned)

Three questions (how decisions get made, how much work follows a defined procedure, whether the team are self-directing professionals) infer a coordination mode. The inferred mode appears in a card with a rationale and a **Change this** toggle that reveals all modes for manual override. **Continue** saves `coordination_mode` plus `coordination_mode_source` (`inferred` or `chosen`) to org settings.

The mode is meant to drive check-in cadence, aging thresholds, escalation routing and message wording. **No page navigates here**, so in practice every org runs on the default mode.

### Step 3 — `/onboarding/profile`

Full name, a country-code dropdown (+254, +234, +27, +44, +1) and a phone number. **Continue** saves and goes to `/onboarding/connections`. No verification step is offered here even though `sendPhoneOtp` / `verifyPhoneOtp` exist in `src/lib/launch.ts` (both currently unused by any page).

### Step 4 — `/onboarding/connections`

A 2-column grid of the nine providers (Gmail, Outlook, Google Calendar, Microsoft Calendar, Google Drive, OneDrive, Fathom, Slack, Teams). Each tile is a button.

| Control | Behaviour |
|---|---|
| Provider tile | **Demo-only** — the tile is `disabled` unless the app is in mock mode. In a real deployment it renders "OAuth not configured" and cannot be clicked |
| **Skip for now** (footer) | Admins → `/onboarding/team`, everyone else → `/onboarding/complete` |
| **Continue** | Same destination logic as Skip |

A note under the grid tells non-mock users to connect later from Integrations.

### Step 5 — `/onboarding/team` (admins)

Rows of email + role (Member / Manager / Admin) with a trash icon per row (disabled when only one row remains) and **Add row**. **Send invites** creates an invite for every row containing `@`, toasts the count, and goes to `/onboarding/complete`. **Skip for now** in the footer.

### Done — `/onboarding/complete`

Animated motif, a summary sentence, and **Go to Flow**, which sets the onboarding flag and navigates to `/flow`.

---

## 8. Core working pages

### 8.1 `/flow` — the hero screen

**Question it answers:** how much of the organisation's time is sitting still, and who is holding it. This replaced a conventional four-count dashboard, and the code comments are emphatic that counts are not the point.

**Panel isolation:** the four panels load independently, and each catches its own error. One dead endpoint dims one card rather than breaking the page. Only if summary, aging and waiting all fail does the whole page become an error state with a single **Retry**.

**Header action — Scope switcher:** `Mine` / `Team` / `Org`, written to the `?scope=` URL param. Scopes above your role are *absent*, not disabled (self for everyone, team for manager+, org for admin+). The switcher hides entirely if you only have one scope.

**Stat cards** (each is clickable):

| Card | Shows | Click target |
|---|---|---|
| Waiting now | Total team-days held up and item count | `/waiting?scope=…` |
| Longest wait | Working days of the oldest item and who holds it. Turns amber past 7 days | `/waiting?scope=…&sort=age` |
| Flow debt trend | Change vs last week with a sparkline; "Level" when flat | `/reports` |
| Unblocked this week | Count of items that started moving again | `/commitments?resolved=7d` — **the param is ignored by the Commitments page** |

**"Needs a human decision"** — only rendered when unresolved escalations exist that are addressed to you (or you are admin+). Up to five rows, each with an **Open** button. That button goes to the `/escalations` list, not to the specific escalation.

**"Aging work in progress"** — a scatter of open items by time in queue against cost of delay, with percentile bands. Clicking a point opens that commitment. Falls back to "No open items in this scope."

**"Waiting register"** — top items by cost-of-delay × age. Each row is a button opening the commitment, with a cost-of-delay badge, a status chip and a waiting duration. A **See all N** button appears in the section header when the register is longer than the preview.

**WIP warning strip** — when open items exceed the configured limit, a banner says so; admins get a **Dismiss** button (session-only, not persisted).

**Empty states** — a completely empty tenant gets "Nothing's waiting" with a **Connect your tools** button to `/integrations`.

**Deliberately absent:** row-level nudge and escalate buttons. The code comment is explicit: *"a button that cannot do what it says is worse than an absent one."*

### 8.2 `/waiting` — the waiting register

Every waiting item, grouped and sorted, with the total held-up time in the subtitle. Filtering happens client-side on the already-loaded payload, so regrouping is instant and the totals cannot disagree with the rows.

| Control | Behaviour |
|---|---|
| Scope switcher | Same as Flow, writes `?scope=` |
| **By holder** / **By project** | Segmented toggle, writes `?group=` |
| Sort dropdown | Cost × age (default) / Age / Project, writes `?sort=` |
| Type chips | Multi-select toggles for waiting kinds, writes `?types=a,b`. Each is `aria-pressed` |
| **Clear** | Removes all type filters (only shown when filters are active) |
| Waiting-days bar chart | Only when grouping by holder and there is more than one group. Clicking a bar smooth-scrolls to that group |
| Group header | Click collapses/expands the group; shows item count and total working days |
| Row title | Link to `/commitments/:id` |

When a type filter hides everything, the page says how many items are waiting for other reasons rather than showing a generic empty state.

**Deliberately absent:** nudge, escalate, reassign and export. Same reasoning as Flow — the send path does not exist yet.

### 8.3 `/my-work` — personal queue

Four stacked sections. The code comment is blunt about what is banned here: no completion rate, no response rate, no streak, because *"a page that scores a person turns a coordination tool into a surveillance tool."*

**Needs a reply from you** — one card per commitment whose latest check-in was outbound and unanswered. Each shows the message text, how long ago, the channel, a link to the commitment, and a sensitivity badge.

| Control | Behaviour |
|---|---|
| **I'm on it** | Posts "I'm on it — in progress" as an inbound reply; the classifier sets the commitment to in progress |
| **Waiting on someone** | Expands a "Who or what?" input |
| Who/what input + **Save** | Posts "Blocked — waiting on X". Enter also submits |
| **It's done** | Posts "It's done" → marks the commitment done and stamps `resolved_at` |
| Free-text input + send icon | Posts anything else through the same classifier. Enter submits |

Replies run through `recordInboundResponse` (`src/lib/engine.ts`), which regex-classifies into done / snoozed / blocked / on_track / unclear, writes a check-in row, and patches the commitment. The confirmation toast changes with the outcome ("Marked done — nice." / "Got it. I'll chase that." / "Thanks — logged.").

**Waiting on others** — up to 10 of your items stalled on someone else, each linking to the commitment with a status chip and duration.
**Moving** — up to 10 of your unblocked items.
**Recently closed** — up to 6 items closed in the last 14 days.

All-empty state: "Nothing needs you right now."

### 8.4 `/commitments` — the register

Title copy changes by role: managers see "Everything owed across your scope", members see "What you owe, tracked automatically". Rows are filtered through `visibleCommitments`, which applies both scope and sensitivity clearance.

| Control | Behaviour |
|---|---|
| **N need review** | Manager+ only, and only when the count is above zero. Links to `/review` |
| **Add manually** | Opens the Add Commitment dialog (see §10) |
| Status filter | All / Open / In progress / At risk / Overdue / Escalated / Done → `?status=` |
| Review filter | All (incl. review) / Live only / Needs review → `?review=` |
| Priority filter | All / Critical / High / Medium / Low → `?priority=` |
| Project filter | All projects, then one entry per project → `?project=` |
| Table row | Opens `/commitments/:id` |

Sort order is fixed and not user-adjustable: status severity (escalated first), then priority, then due date. The Owner column only renders for managers and above. A "Review" pill appears inline on rows flagged `needs_review`.

### 8.5 `/commitments/:id` — commitment detail

The densest screen in the product. It opens with a **Back** link and logs a data-access entry for the audit trail on every view.

**Access check:** if the item's sensitivity exceeds your clearance, the whole page is replaced by "Restricted by data governance" with an explanation and no data.

**Header action bar** — what renders depends on role and state:

| Control | Who sees it | Behaviour |
|---|---|---|
| **Approve review** | manager+, item needs review | Clears the review flag, toasts, reloads |
| **Reject** | manager+, item needs review | Rejects and navigates to `/review` |
| **Mark as done** | owner or manager+, not already done | Sets done and stamps resolution |
| **Escalate now** | manager+, not done | Creates an escalation. **Picks the first manager/admin/owner found in the user list**, falling back to your manager, then yourself — it does not consult the ownership map |
| **Reassign…** | manager+ | A bare `<select>` of all users; selecting one reassigns immediately |
| Date input | manager+ | Edits the due date on change, no confirmation |
| Number input (%) | manager+ | Sets progress percentage on blur |
| **Not a commitment** | manager+ | Flags `not_a_commitment`, clears review, marks done, navigates away |
| **Send check-in now** | manager+, item has an owner | Opens the check-in dialog pre-filled for the owner |
| **Classify** | manager+ | Opens the classification dialog |

**Body sections**, in order:

1. **Status strip** — status badge, priority badge, "Needs review" pill, confidence percentage, snooze note, owner, requester, due date.
2. **Flow timeline** — **API-only**. A per-state segment list with working days and transition timestamps.
3. **Governance strip** — sensitivity badge, tag chips, and an "auto-classified" note when the system did it.
4. **Description**.
5. **Source quote** — the verbatim line the extractor keyed on. This is the trust anchor for AI-created items.
6. **Source meeting** — title, date, category, and an external **View transcript** link.
7. **Blocked by** — dependency list, each linking to the blocking commitment with a **Remove** button for managers, plus a "Link a blocker…" picker and **Add** button.
8. **Extraction feedback** — **Accurate** (thumbs up) and **Incorrect** (thumbs down) buttons, with the feedback history listed underneath. This is the training-signal loop for extraction quality.
9. **Status history** — timestamped transitions with the channel and any note.
10. **Check-in history** — a chat-style transcript, outbound left and inbound right, with the parsed status and blocker shown under each reply.
11. **Escalation history** — cards linking to `/escalations/:id`.

### 8.6 `/review` — review queue (manager+)

Two sections with different purposes.

**Needs confirming** — AI-extracted items below the confidence threshold. Each card shows the title (linked), status, priority, a confidence percentage, the review reason, owner and due date, and the source quote in a blockquote.

| Control | Behaviour |
|---|---|
| **Confirm** | Approves the item; it goes live |
| **Edit** | Reveals an inline title field with **Save & confirm** |
| **Reassign** | Reveals an owner dropdown. **Disabled when running against the Fastify API** |
| **Discard** | Rejects the extraction |

All four are disabled while that row is saving, and they only render for manager+.

**Might be stale** — items flagged by corroboration as having gone quiet. **Read-only** — a title link and a prompt sentence, nothing to click. The empty state states the principle: "Items flagged by corroboration appear here — never as a person score."

### 8.7 `/projects`

| Control | Behaviour |
|---|---|
| **New project** | manager+ only → `/projects/new` |
| Status filter | All / Active / On hold / Completed / Archived (component state, not URL) |
| Table row | Opens the project |

Columns: Name, Client, Owner, Status, Open count, Progress, Health dot. Progress is priority-weighted by commitment status (done = 100%, active = 50%, open = 0%) and never inferred from elapsed time. Empty state offers **Create your first project** to managers.

### 8.8 `/projects/new` (manager+)

Form: Name (required), Description, Client name (optional), Owner dropdown, Status dropdown. **Create project** navigates to the new project; **Cancel** returns to the list. Submit is disabled without a name.

### 8.9 `/projects/:id`

Header shows a health dot and a **Settings** button for managers. A meta strip carries status, client badge, progress label and owner. Six tabs:

| Tab | Contents |
|---|---|
| **Commitments** | An **Add manually** dialog button pre-scoped to this project, then a clickable table |
| **Flow** | A fever chart (buffer consumption vs chain completion) with a method note, plus a "Waiting on this project" list. The buffer is a **hard-coded 10-day demo value** until project settings expose a real one |
| **Milestones** | Table of title, due, status, weight, linked items. Empty state links managers to project settings |
| **Meetings** | Meetings linked via extracted commitments, with participant counts and external **Transcript** links |
| **Timeline** | Commitments sorted by last update — a flat activity list, not a Gantt |
| **Progress** | The calculation method spelled out, the headline figure, a low-confidence warning when many items are stale, and a milestone count |

### 8.10 `/projects/:id/settings` (manager+)

Two sections. **Ownership & status**: owner dropdown and status dropdown, both saving immediately on change. **Milestones**: a list with a **Remove** button each, plus a "New milestone" field and **Add**. Milestones are created with no due date and weight 1 — neither is editable here. A **Back to project** link sits in the header.

### 8.11 `/team` (manager+)

A directory, deliberately constrained. The code comment lists the allowed columns and forbids the rest: *"No overdue/response/WhatsApp/health scores (no per-person performance metrics)."*

| Control | Behaviour |
|---|---|
| **Invite teammate** | **admin+ only** — opens the invite dialog |
| Search field | Client-side filter on name |
| Row | Opens `/team/:id` |

Columns: Name, Role, Team, Open queue count, "Waiting on them" count. The current user is excluded from their own list. Managers see their scope; admins see everyone.

### 8.12 `/team/:id` (manager+)

Header carries **Send check-in now** pre-targeted at this person. An identity card shows avatar, name, role badge, email, and whether messaging is linked (green tick or amber cross). Then a commitments table (clickable rows) and a full check-in history.

One line reads "Responded to X of Y check-ins in the last batch — a coordination fact, not an evaluation." Worth deciding on: it is the one person-level ratio in the product, and it sits directly against the no-scores rule everywhere else.

Admins viewing someone else get a footer link to **Team & roles**.

### 8.13 `/escalations`

| Control | Behaviour |
|---|---|
| Filter chips | all / open / acknowledged / resolved (component state) |
| Row | Opens `/escalations/:id` |
| **Configure escalation routing →** | Always rendered, for every role. Goes to `/settings/ownership-map`, which is **admin-only** — members and managers get silently bounced to `/flow` |

Columns: Commitment, Escalated to, Reason, Status, Open for. Members only see escalations addressed to them or touching their scope; admins see all. Empty state: "Nothing escalated — Everything's moving on its own."

### 8.14 `/escalations/:id`

**Context card** — owner, requester, due date, current status, the reason in a highlighted block, and hours elapsed past SLA. This is the frozen snapshot captured at escalation time, already redacted server-side if the recipient's clearance is too low.

**Last exchanges** — the check-ins captured in that snapshot.

**Take action** — only for managers, or the person the escalation was routed to, and only while unresolved:

| Control | Behaviour |
|---|---|
| **Acknowledge** | Only while status is `open`. Notifies the requester that someone is on it |
| Re-route dropdown + **Re-route** | Reassigns the escalation |
| Resolution note + **Mark resolved** | Both required; the button is disabled until a note is typed |

### 8.15 `/reports` (manager+)

Reports grouped by month. Each card shows Daily/Weekly badge, the period range, and a one-line summary built from the counts ("2 escalations, 5 resolved, 3 overdue"), and opens the report. Admins get a **Report settings** button in the header → `/settings/reports`.

### 8.16 `/reports/:id` (manager+)

| Control | Behaviour |
|---|---|
| **Generate new** | **API-only** — regenerates and reloads |
| **Download PDF** / **Print** | Label depends on whether a stored PDF exists. With the API it fetches the PDF blob and triggers a download; otherwise it calls `window.print()` |

Body renders the report markdown, with a PDF status line above it when using the API. A permanent footer disclaimer states the report describes work items, not individual performance, and must not drive promotion, discipline or termination decisions.

### 8.17 `/surveys` (admin — but the sidebar shows it to managers)

Lists survey cycles. Each shows the title, `n=` response count, status badge, and either the aggregated themes or a suppression message. The threshold is 5 responses (`MIN_SURVEY_N`); below that, no themes are shown at all. Every card repeats "no user-keyed sentiment. Individual answers are purged after aggregation."

| Control | Behaviour |
|---|---|
| **Current survey** | `/surveys/current` |
| **Review questions** | Only for admins on cycles in `pending_review` → `/surveys/:id/review` |

A "Source: API / mock store" line is printed on the page — developer diagnostics visible to end users.

### 8.18 `/surveys/current` (everyone)

Renders approved questions only. Scale questions get a 1–5 number input; others get a text input. Both required. **Submit answers** saves and returns to `/flow` with "Thanks — your answers are private." If you already responded, the page says so with a **Back to Flow** button. With no live cycle, it shows "No live survey right now."

### 8.19 `/surveys/:id/review` (admin)

Each AI-generated question shows its text, kind and approval state, with **Approve** and **Reject** buttons. **Publish survey** validates first: it refuses if any question is still pending, and refuses if all were rejected. On success the cycle goes live and you return to `/surveys`.

### 8.20 `/integrations`

Provider cards in two grids: "Your connections" (personal) and, for admins, "Organization connections". Each card carries a status pill (Connected / Error / Reconnect needed / Disconnected), an optional "Needs attention" badge, the provider name, category and scope note, the connected account and last sync, and a warning when the sync is older than six hours.

| Control | Behaviour |
|---|---|
| **Connect** | Three different paths: with Fastify, requests an auth URL and redirects; with Supabase Edge, redirects to the `oauth` function; in mock mode, **marks the provider connected without any handshake** (labelled "Connect (demo)"). With none configured it toasts that OAuth is not configured |
| **Reconnect** | Same handler, red styling, shown when the connection is expired or errored |
| **Disconnect** | Opens a confirmation dialog explaining that existing tracked commitments are unaffected, with **Cancel** and a destructive **Disconnect** |

Header line: "Company OS reads from these sources. Read-only access only."

### 8.21 `/notifications`

A single list of everything surfaced to you, with per-kind icons (escalation, report, connection error, system), unread styling and a dot, body text and relative time.

| Control | Behaviour |
|---|---|
| **Mark all read** | Only rendered when something is unread |
| Notification row | Marks it read, then follows its link if it has one |

Empty state: "You're all caught up."

### 8.22 `/governance` (manager+)

Three tabs.

**Overview** — three stat cards (classification coverage with a progress bar, items needing classification, policy violations), a classification distribution chart across Public / Internal / Confidential / Restricted, and two clickable lists: governance violations (red) and items needing classification. Every row opens the commitment.

**Tags** — admins get an add-tag row: Name field, default classification dropdown, a "PII / regulated" checkbox, and **Add tag**. The table below lists tag, default classification, PII flag and description, with a trash button per row for admins.

**Access log** — who accessed what sensitive entity, when, and at what sensitivity. Read-only. This is fed by the `logDataAccess` call on commitment detail views.

---

## 9. Settings

`SettingsLayout` renders a left rail (horizontal tabs on mobile) filtered by role, and an outlet for the active panel. `/settings` redirects to `/settings/profile`.

### `/settings/profile` (everyone)

Full name (editable), email (read-only), and phone with a Verified / Not verified indicator. Changing the phone clears verification on save. Help text explains Telegram linking is done by messaging the bot `LINK +yourphone` — **there is no button here that performs the link**, despite the shell banner pointing users to this page to do it. When Telegram is linked, a green confirmation line appears with the username.

Notifications: two switches — **Check-in messages** (with an amber warning below when off: "With check-ins off, Company OS can't track your commitments") and **Morning digest**. **Save changes** persists everything at once.

### `/settings/my-data` (everyone)

The data-subject-rights page. Opens with a callout stating that individual survey answers are never shown to managers and that the product produces no score or ranking.

**Inventory** grid: connection count, commitments owned or requested, check-in message count, survey response count, notice version acknowledged, retention window.

| Control | Behaviour |
|---|---|
| **Export JSON** | Downloads an immediate local JSON file of the inventory |
| **Request access** | Files a DSR of type `access` (30-day SLA) |
| **Request correction** | Files a `rectification` DSR |
| **Request erasure** | Files an `erasure` DSR |
| **Delete survey responses** | **Deletes directly from the local store** — demo-path behaviour |
| **Turn check-ins off** | Flips the messaging preference off immediately |

Footer note is honest about the limits of erasure: commitments you owned stay in the organisational record with your name replaced by "Former team member"; messages and survey responses are deleted.

### `/settings/organization` (admin)

Organization name, timezone dropdown (six zones, Africa/Nairobi default, described as driving when reports and check-ins fire), and default escalation SLA in hours. **Save changes** at the bottom.

Public holidays section: a list with per-row **Remove**, plus a date picker, name field and **Add holiday**. These feed the working-time calculation used across the flow metrics. Saves via API when configured, otherwise locally.

### `/settings/people` and `/settings/roles` (admin)

**The same component.** `SettingsPeople.tsx` is a one-line re-export of `SettingsRoles`. Two nav entries, two routes, identical screens.

**Invite teammate** sits above a table of Name, Email, Role dropdown, Manager dropdown and Status badge. Two guard rails on role changes: you cannot demote the last remaining owner, and only an owner can promote someone to owner. Manager assignment writes immediately.

### `/settings/teams` (admin)

List of org teams showing name, lead and member count, with **Delete** per row, plus a name field and **Add team**. New teams are created with the current user as both lead and sole member; there is no member management UI here.

### `/settings/ownership-map` (admin)

The escalation routing table — arguably the most operationally important settings page.

| Control | Behaviour |
|---|---|
| ↑ / ↓ per row | Reorders locally (priority order) |
| Category field | Saves on blur |
| Keywords field | Comma-separated, saves on blur |
| Scope field | Free text, saves on blur |
| Primary dropdown | Saves immediately |
| SLA field | Hours, saves on blur |
| Trash icon | Deletes the row |
| **Add category** | Appends an empty row |
| **Save order** | Persists the reordering |
| **Test routing** — tags field + **Run test** | Simulates routing and prints "Matched 'x' → Person" or "No match → fallback Person" |

Two gaps worth noting: the table exposes no **backup owner** column even though `backup_owner_id` exists in the model and the escalation engine uses it, and new rows only persist once a field is blurred or the owner is changed.

### `/settings/data-governance` (admin)

Ingestion exclusions — what the system must never read, evaluated before any content is fetched. A callout states filters fail closed and that derived commitments inherit source visibility, and it tells you whether rules live in the database or the local demo store.

Counts by type (keyword / meeting / domain / user), then the rule list with **Remove** per row, then an add row (scope dropdown, match value, optional reason, **Add**), then a **Test** box that tells you whether a sample string would be excluded and by which rule.

### `/settings/messaging` (admin)

Six metric tiles: Meta tier, quality rating, 24-hour send cap usage, opt-in contacts, 7-day opt-out rate (warns at 2%) and 7-day block rate (warns at 3%).

**Throttle** section explains in plain language why sending is currently throttled, if it is — red quality, opt-out rate, block rate, or approaching the cap — and shows three status badges: "Manual approve: on", "Email ingestion: off (C-5)", and "Throttled" when active.

**Opt-in breakdown** — counts and a per-person list of opted in / not linked / opted out.

**Template registry** — eight templates with their purpose and Meta approval status. Read-only; hard-coded in the page rather than loaded from the messaging package.

**Approval queue** — **Queue check-in** adds a preview message to the queue (in mock mode it uses a hard-coded recipient), and each queued item offers **Approve send** and **Reject**.

### `/settings/nudge-quality` (admin)

Precision per nudge trigger with an auto-suspend threshold displayed. Each trigger row shows its id, precision (or `—` before any feedback), sends in the last 7 days, and suspension state, with a **Suspend** or **Resume** button. The callout explains precision only appears after YES/NO nudge feedback arrives.

### `/settings/launch` (admin)

Deployment readiness evidence. Works against Edge Functions in production or Fastify locally; with neither, the whole page collapses to a message telling you which env vars to set.

| Section | Contents and controls |
|---|---|
| AI (OpenRouter) | Whether the key is configured and where it was loaded from |
| ODPC | Status and registration reference, a reference input and **Save** |
| Telegram (primary) | Whether the bot token is configured, plus linking instructions |
| Meta WhatsApp (fallback) | Business verification, WABA and token status, and **Mark Meta verified (after Meta confirms)** — a manual attestation, never inferred |
| Messaging | Mode, primary channel, per-provider status, live-ready flag, and three mode buttons: **Use in_app**, **Use sandbox**, **Use live** |
| OAuth + WorkOS | Configured / missing per provider, listing the exact missing variables |

The page title says it plainly: "Evidence status only — Company OS never marks ODPC or Meta as approved for you."

### `/settings/sso` (admin)

**API-only.** Without `VITE_API_URL` it prints "Connect VITE_API_URL to manage SSO." With it, shows configured status and the missing variables, and a **Start WorkOS SSO** button that redirects to the authorize URL.

### `/settings/compliance` (admin)

Read-back of the attestation captured during onboarding: attested-at, lawful basis, DPO contact, DPIA status, works-council status, plus links to the DPIA and LIA templates in the repo docs. If there is no record, it says so and points at onboarding.

A fixed callout shows `high_risk_use_prohibited = true` and notes it cannot be disabled in the UI.

**Publish updated notice** generates a new notice version and clears every acknowledgement, forcing all users to re-acknowledge on their next visit. **API-only** — it toasts an error otherwise.

### `/settings/security` (admin)

Four cards plus an owner-only fifth.

| Card | Controls |
|---|---|
| Data retention | Dropdown: 6 / 12 / 24 months, saves on change |
| Audit log | A filter field (action or actor) and **Export CSV**, over a table of action, actor, target and timestamp |
| DSR queue | Each request shows type, subject, status and due date, with **Mark fulfilled** while open or in progress |
| Sessions | Per-session user, device and IP, each with **Revoke** |
| Export organization data | **Owner only.** Downloads every record for the org as one JSON file — people, projects, commitments, escalations, check-ins, connections, audit log, DSR queue. Shows "Building export…" while working |

### `/settings/reports` (admin)

Three cards and a save button. **Cadence**: Daily / Weekly / Both. **Recipients**: a checkbox per user, defaulting to admins and owners. **Delivery channels**: Email, In-app, and "Messaging digest (Telegram / WhatsApp)". **Save changes** writes all three into org settings. A **Reports** back link sits above the header.

### `/settings/billing` (owner)

A plan badge, active seat count, a sentence saying billing is manual during the pilot, and a **Contact us to change plan** `mailto:` link. No Stripe, no invoices, no usage.

### `/settings/coordination` — **not routed**

The component exists and is complete: mode picker cards with a "Current" marker, a "What will change" panel that diffs check-in behaviour, aging thresholds, escalation and report wording between the current and selected mode, a strike-through vocabulary comparison, a special note for the professional-services mode, and a **Save coordination mode** button disabled until something changes. None of it is reachable.

---

## 10. Shared dialogs and reusable controls

### Add Commitment dialog

Trigger: **Add manually**. Fields: Title (required), Description, Owner, Project (defaults to "No project", pre-set when opened from a project), Priority, Due date. Footer: **Cancel** and **Save changes** (disabled without a title). Created items are tagged `source_type: "manual"` with the current user as requester.

### Send Check-in dialog

Trigger: **Send check-in now**. When no recipient is pre-set, a person dropdown lists active users and appends "(Telegram not linked)" to anyone unreachable — a nice honest touch. The message box is pre-filled with a contextual line when opened from a commitment. **Cancel** / **Send check-in now** (disabled with no target). Described as messaging "out of the normal cycle".

### Invite dialog

Trigger: **Invite teammate**. Email field and a Role dropdown (Member / Manager / Admin — owner is not offered). **Send invite** is disabled until the email contains `@`.

### Classify dialog

Trigger: **Classify**. **Suggest classification** runs the local heuristic classifier, sets the sensitivity, selects matching tags and toasts its rationale. Then a sensitivity dropdown (Public / Internal / Confidential / Restricted) and a tag grid where each chip toggles (unselected chips render at 40% opacity). **Cancel** / **Save changes**.

### Shared feedback components

`EmptyState`, `ErrorState` (always with a **Retry**), `TableSkeleton` and `StatCardsSkeleton` are used consistently, which is why almost every page has a proper loading and failure state rather than a blank screen.

### Note on file layout

Thirteen files at `src/components/*.tsx` are one-line re-export shims pointing at the organised folders (`dialogs/`, `layout/`, `feedback/`, `shared/`, `brand/`, `auth/`). They are not duplicate implementations — but pages import inconsistently from both paths, which makes the import graph harder to read than it needs to be.

---

## 11. What each page actually calls

| Page | Supabase production | Fastify API | Mock |
|---|---|---|---|
| Flow / Waiting | Derived client-side from commitments | `/flow/summary`, `/flow/aging`, `/waiting` | Seed-derived |
| My work | Check-ins + commitments | Same via `apiDb` | Local store |
| Commitments, Projects, Team, Escalations, Notifications, Governance | Supabase tables | `apiDb` | Local store |
| Commitment flow timeline | *not available* | `/commitments/:id/flow` | *not available* |
| Review queue | `needs_review` rows | `/review`, `/review/:id/confirm|reject` | Local store |
| Reports list | `reports` table | `/reports` | Local store |
| Report PDF / Generate new | *not available* | `/reports/:id/pdf`, `/reports/generate` | Print dialog |
| Surveys | Local cycles | `/surveys` | Local store |
| Integrations connect | Edge `oauth` function | `/connections/:provider/authorize` | Instant fake connect |
| Launch readiness | Edge `launch-readiness` | `/launch` | Page unavailable |
| SSO | *not available* | `/sso/*` | *not available* |
| Compliance / Notice records | *not enforced* | `tenant_compliance`, `users.notice_acknowledged_at` | *not enforced* |
| Messaging approvals | Local store | `/messaging/approvals` | Local store |
| Nudge quality | Local store | `/nudge-quality` | Local store |
| Exclusions | Local store | `/exclusions` | Local store |
| Autonomy sweep | *not available* | `/admin/sweeps/run` | *not available* |

**Backend inventory for context:** 15 Supabase Edge Functions (`chat-webhook`, `escalate`, `extract-commitments`, `fathom-webhook`, `generate-report`, `ingest-meeting`, `launch-readiness`, `oauth`, `send-checkin`, `send-digest`, `sync-calendar`, `telegram-webhook`, `verify-otp`, `whatsapp-webhook`, `workos-webhook`) and 24 Fastify route modules.

---

## 12. Review findings

### A. Broken or dead paths

1. **Surveys role mismatch.** The sidebar shows "Surveys" to managers (`minRole: "manager"` in `AppLayout`), but the route requires admin. A manager who clicks it is silently bounced back to `/flow`. Either open the route to managers or hide the nav item.
2. **Coordination mode is unreachable.** `/onboarding/coordination` is routed but nothing navigates to it, and `/settings/coordination` has no route at all. Meanwhile the onboarding copy says "You can change this later at Settings → Coordination". A whole feature — cadence, aging thresholds, escalation routing and message vocabulary per organisation type — is built and switched off. This is probably the single highest-value fix on the list.
3. **"Configure escalation routing →" is a dead end for most users.** It renders on `/escalations` for every role but targets an admin-only page. Gate the link.
4. **`/commitments?resolved=7d` does nothing.** The Flow "Unblocked this week" card passes a filter the Commitments page never reads, so it lands on an unfiltered list.
5. **Flow "Needs a human decision" → Open** goes to the escalations list rather than the specific escalation.
6. **Compliance and notice gates do not enforce on production.** `useLegalGates` returns `enforced: false` whenever `VITE_API_URL` is unset, and `OnbCompliance` only writes the attestation when the API is configured. On the Supabase deployment path, the blocking legal gate collects five attestations and a DPO email and then discards them. Given that this is the compliance story, it needs either a Supabase write path or an explicit decision to keep it API-only.
7. **Telegram linking has no button.** The shell banner sends users to `/settings/profile` to "link", but that page only prints instructions to message the bot manually. Phone OTP helpers (`sendPhoneOtp`, `verifyPhoneOtp`) exist in `src/lib/launch.ts` and are called by nothing.
8. **Onboarding step labels are wrong.** The rail is Organization / Compliance / Profile / Connections / Team, but `Notice` renders as step 0 ("Organization") and `Coordination` as step 1 ("Compliance"). Users on those pages see the wrong step name.
9. **Onboarding connections cannot connect anything in a real deployment.** Tiles are `disabled` unless in mock mode, while `/integrations` has working Edge and API paths. The wizard step is effectively decorative in production.

### B. Duplication and inconsistency

10. **`/settings/people` and `/settings/roles` are the same page** via a re-export, listed twice in the settings nav.
11. **Two pages titled "Data governance"** — `/governance` (manager+, classification and access log) and `/settings/data-governance` (admin, ingestion exclusions). Different jobs, same name.
12. **Commitment detail's action bar mixes styled buttons with bare `<select>` and `<input>` elements** (Reassign…, date, progress %) that save silently on change or blur with no confirmation and no undo. It is the only place in the app that does this.
13. **"Escalate now" bypasses the ownership map.** It grabs the first manager/admin/owner in the user list, while the whole `/settings/ownership-map` page exists to decide exactly this. Manual escalation and automatic escalation route differently.
14. **Import paths are inconsistent** — some pages import `@/components/PageHeader`, others `@/components/layout/PageHeader`, for the same component.

### C. Hard-coded or placeholder behaviour worth checking

15. Project fever chart uses a **fixed 10-day buffer** with an on-screen note saying so.
16. Messaging **template registry is hard-coded in the page**, duplicating the messaging package's seeds.
17. Mock survey themes are a literal `[{ tag: "clarity", count: 3 }]`.
18. The messaging **Queue check-in** button uses a hard-coded recipient id in mock mode.
19. `/surveys` prints "Source: API / mock store" to end users — developer diagnostics left in the UI.
20. Integrations **Connect** in mock mode marks a provider connected with no handshake at all.

### D. Governance tension to resolve deliberately

21. **`/team/:id` shows "Responded to X of Y check-ins"** — a per-person response ratio, on the same page family where `Team.tsx` explicitly bans response metrics and `MyWork.tsx` bans personal statistics. It is labelled "a coordination fact, not an evaluation", but it is the one number in the product that could be read as a score. Decide consciously whether it stays.

### E. Capability gaps

22. **No action from the Waiting register.** No nudge, escalate, reassign or export. This is deliberate and documented, but it means the manager's primary screen is read-only — they see the stall and then have to go elsewhere to act.
23. **No search.** There is no global search, and no text search within commitments, projects or escalations. Only `/team` has a name filter.
24. **No bulk actions anywhere** — not in the review queue, not in commitments.
25. **No pagination or virtualisation** on any list. Commitments, escalations and the audit log all render everything.
26. **Ownership map has no backup-owner column** even though the escalation engine falls back to `backup_owner_id`.
27. **Teams have no member management** — you can create and delete a team, but not add anyone to it.
28. **Project milestones cannot be edited** — no due date, no weight, no status change, no commitment linking, despite all four fields existing in the model.
29. **Billing is a `mailto:` link.**
30. **Banner dismissals are permanent** with no way to restore them.

---

## 13. Candidate add / remove / merge list

### Fix first (small effort, visible breakage)

- Align the Surveys nav role with the route role.
- Gate the "Configure escalation routing" link to admins.
- Point Flow's "Open" at `/escalations/:id`, and either implement `?resolved=7d` on Commitments or change the card's target.
- Correct the onboarding step indices for Notice and Coordination.
- Remove the "Source: API / mock store" line from `/surveys`.

### Decide (product calls, not bugs)

- **Coordination mode**: route it and link it from onboarding and settings, or delete both files and the copy that references them. Leaving a built differentiator dark is the worst of the three options.
- **Compliance enforcement on Supabase**: port the attestation and notice writes to the production data plane, or state clearly that the pilot runs on the API path.
- **Telegram linking**: add a real link flow (deep link or OTP, both partly built) or change the banner copy so it stops promising something the page cannot do.
- **The one person-level ratio** on `/team/:id`: keep or remove.
- **Manual "Escalate now"**: route it through the ownership map so both escalation paths agree.

### Merge or remove

- Fold `/settings/people` into `/settings/roles`; drop one nav entry.
- Rename one of the two "Data governance" pages — for instance "Classification & access" for `/governance`, "Ingestion rules" for the settings page.
- Consider folding `/settings/nudge-quality` into `/settings/messaging`; they are both about outbound quality and the nudge page is thin.
- Consider whether `/onboarding/connections` earns its step in a production deployment where it cannot connect anything.

### Add (ordered by how often the absence will be felt)

1. **Search** — global, or at minimum a text filter on commitments.
2. **Actions on the Waiting register** — the nudge send path is the unlock; everything else on that screen is already built.
3. **Bulk confirm/discard in the review queue** — the first busy week will make this urgent.
4. **Pagination or virtualised lists** before any tenant passes a few hundred commitments.
5. **Backup owner in the ownership map**, since the engine already honours it.
6. **Team membership editing** and **milestone editing** — both are half-built models with no UI.
7. **An access-denied screen** instead of the silent redirect in `RequireRole`, so a user who lands on a manager URL understands what happened.

---

*Generated by reading `src/` in full: 3 layout files, 4 dialogs, 7 auth pages, 8 onboarding pages, 23 application pages, 17 settings panels, plus the auth context, guards, data-plane selector and flow data layer.*
