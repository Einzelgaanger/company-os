# 05 — Conversation Design

## 5.1 The problem this file solves

A bot that asks "how's it going?" collects optimistic answers. Not because people lie, but because in most organizations reporting trouble is more expensive than reporting fine, so "fine" is the rational answer until it is undeniable. Status reports run green for months and then reveal red days before a deadline. This is a systems property, not a character property.

v2's flagship check-in was: *"Hi {name}, checking in on {title} — it's due {date}. How's it going, and is anything blocking you?"*

That message does four harmful things at once. It asks for a **self-assessed status** (invites shading). It leads with a **deadline** (frames the interaction as accountability). It puts the blocker question **second and open-ended** (raising the cost of admitting one). And it uses "due", which in most workplaces means "you are about to be late."

This file replaces it.

---

## 5.2 The three commitments

**1. Never ask for a status. Ask for observable facts.**

A person can shade a colour or a percentage without feeling dishonest. It is much harder to shade *"what's the last thing that got finished on this?"* — the answer is either a thing or it is nothing, and "nothing yet" is a fact, not a confession.

Loop derives the state from facts. The person never picks the label.

**2. Make waiting the cheapest answer.**

Reporting a blocker must be **one tap**, and the immediate experience must be help arriving, not attention arriving. The confirmation matters as much as the question: the person needs to see that the system took the problem off their desk.

**3. Never make the reporter visible as the source of bad news.**

Escalations name the **item** and the **waiting relationship**. They never name who reported it, and never characterize anyone. "This item is waiting on the data team" — not "Alfred says Kayode is blocking him."

---

## 5.3 The check-in, rebuilt

**Structure:** one factual question, three tap options covering the common answers, free text always available.

```
Loop → Quick one on *SharePoint usage data* for Atlas.
       What's the last thing that moved on it?

       [ Waiting on someone ]  [ I'm on it ]  [ It's done ]
```

Note what is absent: no due date, no "how's it going", no status vocabulary, no urgency framing.

**Branches:**

**Waiting on someone** — one follow-up, then Loop takes over:
```
Loop → Who or what are you waiting on?
User → kayode, he pointed me to someone in IT
Loop → Got it. I'll chase that and let you know.
       → flow_state = waiting_internal
       → waiting_on resolved against the roster
       → escalation evaluated per coordination mode
```
Total user cost: one tap plus a few words. That is the design target, and it is the number to protect in every future change.

**I'm on it** — no follow-up at all:
```
Loop → Thanks. I'll check back Thursday.
       → flow_state = active
```
Zero friction for the common case is what keeps response rates alive.

**It's done** — corroborate lightly, never interrogate:
```
Loop → Nice. Anything the requester needs to see, or shall I close it?

       [ Close it ]  [ Send them a note ]
       → flow_state = review, then done
       → requester notified
```

**Free text** always routes through the classifier (`05_AI_PIPELINE` equivalent, now `packages/ai`), which maps to a flow state with a confidence score. Below 0.7 → one clarifying question, then stop. Never loop.

---

## 5.4 Vocabulary rules

Applied globally, in messages and UI, via the coordination-mode `vocabulary` map.

| Never | Instead | Why |
|---|---|---|
| "overdue" | "past its committed date" / "still open" | Overdue is a verdict |
| "you're late" | *(nothing — never say this)* | Nothing good follows |
| "blocked" *to the person* | "waiting on" | Waiting is about the system; blocked sounds like a personal failure |
| "status" | "where it stands" | Status invites a colour |
| "why hasn't this been done" | "what's it waiting on?" | The first asks for a defence; the second asks for a fact |
| "your overdue items" | "items waiting on you" | Ownership without accusation |
| "failed to respond" | "no reply yet" | Neutral |
| "performance" | *(never appears anywhere)* | See brief §0.6 |

Applies to escalations too. An escalation says *"Item X has been waiting 4 days on the data request"* — not *"Kayode hasn't delivered."*

---

## 5.5 Full message set

All WhatsApp templates. Category `utility`. Every variable bound to a database value; no free model text ever reaches a recipient. Register varies by coordination mode (`03_COORDINATION_MODES.md` §3.3) — the `colloquial` form is shown; `formal` variants are in `packages/messaging/src/templates/`.

| Key | Trigger | Body |
|---|---|---|
| `otp_verify` | Phone verification | Your Loop code is {{1}}. It expires in 10 minutes. |
| `checkin_open` | Scheduled check-in, item has no committed date | Quick one on *{{1}}*{{2}}. What's the last thing that moved on it? |
| `checkin_dated` | Scheduled check-in, item has a committed date within 3 working days | Quick one on *{{1}}* — you'd said {{2}}. What's the last thing that moved on it? |
| `checkin_bundle` | 2+ items due for the same person same day | A few things I'd love a line on: {{1}}. Which one's furthest along? |
| `checkin_waiting_followup` | Item already waiting, checking whether it cleared | Still waiting on {{1}} for *{{2}}*? |
| `waiting_who` | Branch after "waiting on someone" | Who or what are you waiting on? |
| `waiting_ack` | After a waiting answer | Got it. I'll chase that and let you know. |
| `active_ack` | After "I'm on it" | Thanks. I'll check back {{1}}. |
| `done_confirm` | After "it's done" | Nice. Anything {{1}} needs to see, or shall I close it? |
| `clarify` | Classifier confidence below 0.7 | Sorry — is *{{1}}* still moving, waiting on someone, or finished? |
| `unblock_request` | To the person being waited on | Hi {{1}} — *{{2}}* is waiting on you{{3}}. Anything I can do to help it along? |
| `escalation_notify` | Escalation fires | Hi {{1}} — *{{2}}* has been waiting {{3}} working days on {{4}}. It's for {{5}}. Can you help it move? |
| `escalation_ack` | To whoever raised it | Update on *{{1}}*: {{2}} is on it now. |
| `resolved_notify` | Item closed | *{{1}}* is closed. {{2}} |
| `survey_invite` | Survey cycle opens | Hi {{1}} — {{2}} quick questions on how work's going this week. Under a minute, or reply SKIP. |
| `standup_prep` | Before a recurring meeting, to its owner | Before {{1}}: {{2}} items waiting, longest {{3}} days on {{4}}. Detail: {{5}} |
| `optout_confirm` | STOP received | You're unsubscribed from Loop check-ins. Turn them back on any time in your Loop settings. |
| `nudge_feedback` | Appended occasionally, see §5.7 | Was this one useful? [ Yes ] [ Not really ] |

**Note `unblock_request`.** v2 had no message to the person being waited on — it went straight to escalation. That is backwards. Most waiting clears with a direct, friendly ask before anyone senior needs to hear about it. This single template will resolve the majority of waiting states and should be the most-sent message in the system.

---

## 5.6 Escalation, redesigned

**Trigger** varies by coordination mode. In `mutual_adjustment`, the default sequence for an item in a waiting state:

| When | Action |
|---|---|
| Immediately on entering `waiting_*` | `unblock_request` to the person being waited on, if internal and opted in |
| +1 working day, still waiting | Second `unblock_request`, softer |
| +2 working days | Escalate: `escalation_notify` to the routed owner, `escalation_ack` to the raiser |
| +2 further working days, unacknowledged | Escalate to backup |
| +2 further | Surface on `/flow` under "Needs a human decision"; stop messaging |

**Messaging stops after the third escalation.** A system that keeps nagging after nobody has acted has a routing problem, not a persistence problem, and continued messages only teach people to ignore it.

**The escalation payload** — everything the recipient needs, so they never have to ask "what's this about":
- The item, its project, and its cost-of-delay band
- Who asked, when, and from which source (with a link to the meeting or message)
- How long it has been waiting, in working days
- What the owner said, verbatim, capped at 200 characters and stripped of URLs, addresses and phone numbers
- Every prior attempt, timestamped
- One button: **Take this** — reassigns the waiting-on to the recipient and notifies the raiser

**Routing** comes from `ownership_map` in `topic_owner` mode, from the coordination profile otherwise. Crucially, in `standardized_skills` mode, `allowSupervisoryRoute: false` means escalation never goes to someone who could be read as supervising a professional's judgement.

---

## 5.7 Nudge precision — the alert-fatigue loop

Alert fatigue is well documented across healthcare, aviation and IT operations, and the only real defence is disciplined threshold calibration plus willingness to turn off alerts that are not earning their place. The people who respond to alerts should be the ones who set the thresholds.

Loop must measure its own signal-to-noise or it will slowly become a thing people mute.

**Collection:** append `nudge_feedback` to roughly 1 in 5 outbound messages, rotating so no person gets it twice in a week. Two taps: Yes / Not really.

**Schema:**
```sql
CREATE TABLE nudge_feedback (
  id             bigserial PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  message_id     uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  trigger_kind   text NOT NULL,   -- checkin_open | unblock_request | escalation_notify | survey_invite ...
  useful         boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

**Metrics, per tenant per trigger kind:**
| Metric | Definition | Floor |
|---|---|---|
| Nudge precision | useful / rated | **0.70** |
| Response rate | replied / sent | 0.50 |
| Escalation routing accuracy | not re-routed / escalations | 0.80 |
| Opt-out rate, 7-day | opt-outs / recipients | ceiling 0.02 |

**Automatic responses:**
- A trigger kind below 0.70 precision over 20+ ratings → **auto-suspend that trigger for that tenant**, notify admins with the numbers, and surface it at `/settings/nudge-quality` with a "resume" action.
- Opt-out rate above 2% → halve the tenant's daily send cap, notify admins.
- Response rate below 0.50 → surface as advice, no automatic action; it usually means cadence is too high.

**`/settings/nudge-quality`** shows precision by trigger kind, a 12-week trend, which triggers are suspended, and lets an admin adjust cadence and thresholds. This is the page that keeps Loop from becoming noise, and it is why the thresholds are visible and editable rather than hardcoded.

---

## 5.8 Inbound handling

**Global commands**, checked before classification:

| Input | Action |
|---|---|
| `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` | Durable opt-out — **written to Postgres**, not memory (see `06_ENFORCEMENT.md` §6.5). Cancel every queued message. Confirm once. |
| `START`, `RESUME`, `SUBSCRIBE` | Clear opt-out, confirm |
| `HELP` | *(v2 did not implement this — it must exist.)* One line explaining what Loop is, plus a link |
| `SKIP` | Exit the current survey cleanly, no record of who skipped |
| `STATUS` | The person's own open items and longest wait. Their own only. |

**Open-domain refusal.** Meta's terms bar general-purpose AI chatbots from the Business Solution while permitting purpose-specific business assistants. When a message is unrelated to work coordination, Loop replies once: *"I only handle work check-ins here. The Loop app has everything else."* — and does not engage further.

**Service window.** Free-form replies are legal only within 24 hours of the person's last inbound message. Track `conversations.service_window_expires_at`. Outside it, templates only. The multi-turn check-in branches in §5.3 all occur inside a window the user opened by replying, which is what makes them legal.
