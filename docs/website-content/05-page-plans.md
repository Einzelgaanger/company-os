# Phase 5: Page plans and copy drafts

Punctuation: no em dashes; no Oxford commas. Budgets from Phase 2. Evidence = Capability IDs.

---

## Page: `/`
Purpose: Explain what Company OS is, for whom, how the loop works and drive signup.
Primary visitor: Ops lead / PM / founder evaluating follow-through tools.
Primary question: What is this / is it for me / how does it work.
Primary CTA: Start your workspace → `/signup`
Secondary CTA: See how it works → `#flow` (after moving how-it-works target)

### Section order (current → proposed)
1. Nav: keep. Footer "Features" → "Product" for consistency.
2. Hero: sharpen promise (Chat + outcome).
3. Problem (`mk-problem`): keep purpose; **move `id="how"` off this section** onto flow. Add `id="problem"` optional; nav "How it works" must land on six beats. Problem keeps content.
4. Flow: add `id="how"` (and keep visual). This is a content/IA fix via existing id attribute move (allowed as flow fix; log in changelog).
5. Narrative / Modes / Audience / Ribbons / Statement / CTA / Footer: rewrite copy in place; same components.

### Copy drafts

#### Nav
- Slot: footer Features link label | Budget: 12
  - Current: "Features"
  - New: "Product"
  - Rationale: G10 inconsistent
  - Evidence: n/a

#### Hero
- Slot: slogan | Budget: 40
  - Current: "Your Agentic Chief Of Staff"
  - New: keep (brand)
- Slot: promise | Budget: 240
  - Current: long em-dash sentence
  - New: "Captures owned commitments from work already in motion, checks in on Chat or each person's channel and when someone is stuck finds who can unblock them. Project leads get the operating picture without another board to babysit."
  - Rationale: G2, G7; product definition
  - Evidence: C1, C4, C5, C9, C11

- Slot: primary CTA | keep "Start your workspace"
- Slot: secondary CTA | keep "See how it works" (href `#how` → flow after id move)

#### Problem
- Slot: H2 | keep (strong, specific)
- Slot: body | Budget: 280
  - New: "A request sits in a thread. A date slips in a meeting that nobody wrote down. A project manager spends the week chasing updates instead of unblocking work. By Friday the report is a collage of optimistic greens. Company OS exists so that does not happen: for a five-person studio or a multi-division company."
  - Rationale: remove em dash (G8)
- Slot: aside
  - New: "Company OS is the agentic chief of staff that keeps follow-through alive: capture, prompt, escalate with context and report. People are not left chasing when work gets stuck."
- Slot: ticks
  - New:
    1. "Extract and own every commitment"
    2. "Prompt people before silence calcifies"
    3. "When someone is stuck, find who can unblock them"
    4. "Escalate with context: no chasing, no stress pile-on"
    5. "Put project reports in the right hands"

#### Flow
- Slot: H2 | keep "Six beats. One continuous operating loop."
- Slot: lead
  - New: "The product is not a board you babysit. It is a loop that runs while people do the work: detecting promises, checking in and writing the operating picture your leads already wish they had."
- FLOW bodies:
  1. Detect: "Meetings and chat become owned commitments with a review gate when confidence is low. Notes stop evaporating after the call."
  2. Track: "Every item has an owner, a due date and a waiting trail. The company can see what is actually in motion."
  3. Check: "People get calm prompts in Chat by default, or on Telegram or WhatsApp when they link a channel. Facts about the work, not another status colour."
  4. Nudge: "Silence gets a human follow-up before the stall becomes political. Soft first. Then louder, by policy."
  5. Escalate: "When work is stuck, Company OS reads the trail (who owns it, what it depends on, who can unblock it) and routes the ask there. People are not left to guess, chase or escalate themselves."
  6. Report: keep meaning; "Project managers and leads receive governed reports: where time went, what is waiting, what moved and what needs a decision."

#### Channels (narrative)
1. Check-ins title: keep
   Body: "Company OS checks in on live work the way a chief of staff would: short, specific and timed to the item, not a blast to the whole company. Owners reply in Chat or the channel they already live in. The system records the answer. Only when something is actually stuck does it escalate: with context, not panic."
2. Escalation: keep title
   Body: "When someone is blocked, Company OS already has the meeting notes, owners and dependencies. It knows who to ask next so the person doing the work does not have to chase sideways, and the project manager does not have to hunt for the right inbox. Escalation arrives with judgment: the right person, the right tone, not a public pile-on."
3. Reports: keep title
   Body: "Leads see project health, waiting time, open decisions and follow-through on commitments, scoped to their projects, not a company-wide dump. This is operational visibility: who is holding work, what is blocked, what closed. It is not a scorecard for promotion or discipline."

#### Modes
- Lead: "A forty-person studio and a forty-person marketing agency often run the same way. A studio and a payments operations team do not. Company OS changes cadence, tone, who gets asked and how escalations route so it feels native, not bolted on."
- Mode bodies: remove em dashes; keep intent. Studios: "Informal, fast, everyone on chat. Company OS finds who to ask and asks for you: light check-ins, lateral unblocks."

#### Audience
- Everyone points:
  - keep first
  - "Reply in Chat, or on Telegram or WhatsApp when linked. The record updates everywhere."
  - keep third (fix dash if any)
- Operators point 2: "Escalations that arrive with judgment: quiet for ops, louder when the cost of delay is real"
- PM point 3: "See follow-through by owner and team: operational, not a people-ranking board"

#### Ribbons
1. Body: "Every promise gets an owner, a due date and a trail so follow-through is the default, across any company shape you run."
2. Title: keep; Body: "Chat, Telegram and WhatsApp (when connected) prompts that sound like a chief of staff: specific to the work, never a bot spam blast."
3. Body: "Stuck work does not mean you have to stress or guess who to ping. Company OS uses owners, dependencies and how your company coordinates to route the ask to the person who can actually unblock it: quietly when that is enough, louder when delay is expensive."

#### Statement
- Sub: "Waiting made visible. Follow-through made default. Reports that describe the work, never a ranking of people."

#### CTA band
- H2: "Less chasing on your company. More work that closes."
- Body: "Create a workspace, invite the people who hold work and connect Chat or the channels you already use. Company OS starts the loop."
- Button: keep "Create your workspace"

#### Footer
- Blurb: "Captures commitments, checks in on Chat or messaging channels and escalates with context when work is stuck so people stop chasing."

---

## Page: meta (`index.html`)
- Title: `Company OS: Your Agentic Chief Of Staff` (≤60)
- Description: `Company OS is an agentic chief of staff for teams that lose commitments in chat. It captures owned work, checks in and escalates blockers with context.` (~155)
- OG/Twitter: align; no em dashes

---

## Page: `/privacy-policy`
Purpose: Legal truth; align messaging channels with product.
- Intro: replace em dash with colon or comma.
- Collect → Messages bullet: Chat (default), Telegram and WhatsApp when connected; email for notices/reports where configured. Do not claim email as primary check-in.

## Page: `/terms-of-service`
- Intro: replace em dash.
- Service section: keep anti-task-manager / anti-HR; optional mention Chat as coordination surface.

---

## Proposed (not built): FAQ reuse
Reuse `mk-narrative` or a future section for 6 objections from the bank. Log in open questions. Do not add components without approval.

## Phase 6 checklist (drafts)
- [x] Concise / scannable / objective
- [x] No banned hype words introduced
- [x] No em dashes / no Oxford commas in new strings
- [x] AI framed as job done + human review
- [x] Channels truthful (Chat first)
