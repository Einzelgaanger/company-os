# 06 — WhatsApp Channel

## 6.1 Platform constraints that shape the design (C-6)

These are Meta platform rules, not preferences. Build to them or the channel gets disabled.

| Constraint | Rule | Implementation consequence |
|---|---|---|
| **Template approval** | All business-initiated messages must use templates Meta reviewed and approved in advance | `message_templates` registry; no send may reference an unapproved template |
| **24-hour service window** | Free-form replies allowed only within 24h of the user's last inbound message | Track `conversations.service_window_expires_at`; outside it, template only |
| **Opt-in** | Explicit opt-in required before any business-initiated message | `users.whatsapp_opt_in_at`; no opt-in → no send, ever |
| **Messaging tiers** | Unverified starts at 250 unique contacts / 24h, then 1K → 10K → 100K → unlimited; re-evaluated every ~6 hours based on quality and volume | Per-tenant daily quota tracking; queue throttling |
| **Throughput** | ~80 messages/second ceiling on the standard tier | Global rate limiter on `outbound-whatsapp` |
| **Quality rating** | Block/opt-out rate above ~2–3% degrades the rating and drops the tier | Monitor per tenant; auto-throttle above 2% |
| **Template limit** | Up to 250 approved templates per account across all languages | Loop uses ~12; ample headroom |
| **Category & billing** | Utility templates are free inside an open service window; marketing templates are billed and, in some markets, restricted | **Every Loop template is `utility`.** None is marketing. |
| **AI policy (from 15 Jan 2026)** | General-purpose AI chatbots are barred from the Business Solution; purpose-specific business assistants are permitted | Loop's assistant must **refuse open-domain chat** — see §6.5 |

**Business verification is a launch blocker.** Meta Business verification plus WhatsApp number registration plus template approval takes days to weeks. Start it in Phase 1, not Phase 3.

---

## 6.2 Template registry

Seed `message_templates` with these. All category `utility`, language `en` (add `sw` for Swahili at the pilot's request).

| `template_key` | Purpose | Body |
|---|---|---|
| `otp_verify` | Onboarding verification | Your Loop verification code is {{1}}. It expires in 10 minutes. |
| `checkin_pre_due` | Proactive, before due date | Hi {{1}}, checking in on *{{2}}* — it's due {{3}}. How's it going, and is anything blocking you? |
| `checkin_bundle` | Multiple items due same day | Hi {{1}}, a few things coming up: {{2}}. Quick status on each? |
| `checkin_overdue` | Past due | Hi {{1}}, *{{2}}* was due {{3}}. Where does it stand? |
| `checkin_general` | No specific due item | Hi {{1}}, how's *{{2}}* going this week, and is anything in your way? |
| `clarify` | Reply was unclear | Just to confirm — is *{{1}}* done, in progress, or blocked on something? |
| `escalation_notify` | To the escalation owner | Hi {{1}}, *{{2}}* is still pending with {{3}} — it was due {{4}}. Reason given: "{{5}}". Can you help unblock it? |
| `escalation_ack` | To the original requester | Update on *{{1}}*: {{2}} is now looking into it. |
| `confirm_resolved` | To the requester when done | *{{1}}* is now marked done. {{2}} |
| `survey_invite` | Start a survey | Hi {{1}}, quick {{2}}-question check on how work's going. Takes under a minute — reply to start, or reply SKIP. |
| `standup_prep` | To the meeting owner before a standup | Standup snapshot for {{1}}: {{2}} on track, {{3}} blocked, {{4}} overdue. Detail: {{5}} |
| `optout_confirm` | Confirming opt-out | You're unsubscribed from Loop check-ins. You can turn them back on any time in your Loop settings. |

**Rules:**
- Variables are bound **only** to database values (C-4). No model-generated free text goes into a template variable, with one bounded exception: `escalation_notify` `{{5}}` carries the user's own reported blocker text, capped at 200 characters and stripped of URLs, addresses, and phone numbers.
- Every template body must be renderable from `variable_map` without runtime string concatenation in business logic.
- Template approval status is synced from Meta nightly. A template that becomes `paused` or `rejected` immediately stops being used; jobs referencing it fall back to the nearest approved template or are held.

---

## 6.3 Outbound send pipeline

```
schedule → eligibility gate → quota gate → window check → render → send → record
```

**Eligibility gate — every check must pass, no exceptions:**
1. `users.status = 'active'`
2. `notice_acknowledged_at IS NOT NULL` (C-3)
3. `whatsapp_opt_in_at IS NOT NULL` and `whatsapp_opt_out_at IS NULL`
4. `phone_verified_at IS NOT NULL`
5. Current time is within tenant working days and outside quiet hours (in the tenant's timezone)
6. Person is under `max_checkins_per_person_per_day`
7. No message sent to this person about this commitment in the last 24h
8. Commitment is not `review_required`

Failing any gate is not an error — the job reschedules to the next eligible slot. Log the reason at debug level for support.

**Quota gate:**
- Check `messaging_quota` for today against the tenant's current Meta tier cap.
- Check the per-tenant Redis token bucket.
- Check the global 80/sec limiter.
- Over quota → defer to tomorrow, prioritizing by commitment `priority` then `due_date`.

**Window check:**
- If `service_window_expires_at > now()`, a free-form message is legal — but Loop still uses templates for consistency and auditability. Free-form is used **only** for the survey question flow (§6.4), where conversational continuity matters.
- Outside the window, template only.

**Send and record:** insert `messages` row with `delivery_status='queued'` before dispatch, update on the provider callback. Increment `messaging_quota`.

---

## 6.4 Conversation flows

### 6.4.1 Standard check-in

```
Loop  → [checkin_pre_due] "Hi Alfred, checking in on *SharePoint usage data* — it's due Friday.
         How's it going, and is anything blocking you?"
User  → "still waiting on kayode, he sent me to someone else"
        → classify: status=blocked, blocker="waiting on Kayode, redirected to another person"
Loop  → [free-form, window open] "Got it — I'll flag that. Anything else you need to move forward?"
        → enqueue escalate
```

### 6.4.2 Escalation (the referral-chain killer)

The canonical case, drawn from real ProDG history — implement this as an integration test:

```
Commitment: "Share SharePoint usage data (column D)"
  owner: Kayode  |  requester: Alfred  |  due: Friday  |  source: 16 June meeting

Friday+1, no update:
Loop → Kayode  [checkin_overdue]
Kayode → "I don't have it, someone else handles that"
  → classify: blocked
  → ownership_map lookup: category "data requests" → primary owner resolved
Loop → Data owner  [escalation_notify] with full context: original request, requester,
                    due date, Kayode's exact reply, link to the source meeting
Loop → Alfred      [escalation_ack] "Update on SharePoint usage data: {owner} is now looking into it."
```

Alfred sends zero follow-up messages. Nobody is forwarded to a third person. The escalation carries the whole history, so the new owner starts with context instead of asking "what's this about?"

### 6.4.3 Survey (multi-turn, inside the service window)

```
Loop → [survey_invite] "Hi Alfred, quick 4-question check on how work's going.
        Takes under a minute — reply to start, or reply SKIP."
User → "ok"
        → conversations.state = 'in_survey', state_context = {cycle_id, question_index: 0}
Loop → [free-form] "1/4 — On a scale of 1–5, how clear were your priorities this week?"
User → "3"
Loop → [free-form] "2/4 — What slowed you down most this week?"
...
Loop → [free-form] "That's it — thanks. Your individual answers aren't shown to anyone."
        → state = 'idle'
```

**Survey rules:**
- Maximum 5 questions. Under 60 seconds to complete.
- Abandonment after 24 hours of silence is normal and fine — partial responses still aggregate.
- `SKIP` at any point exits cleanly with no follow-up and no record of who skipped.
- The closing reassurance line is mandatory, not optional copy.

---

## 6.5 Inbound handling

**Webhook:** `POST /webhooks/whatsapp`
1. **Verify the `X-Twilio-Signature` header.** Reject unsigned or invalid requests with 403 — do not process, do not log the body.
2. Idempotency on the provider message SID.
3. Resolve sender phone → `users`. Unknown number → reply once with `optout_confirm`-style "This number isn't linked to a Loop account" and stop. Never leak whether a number exists in another tenant.
4. Open/extend the service window: `service_window_expires_at = now() + 24 hours`.
5. Route by `conversations.state`:
   - `in_survey` → record the answer, advance to the next question.
   - `awaiting_reply` / `awaiting_clarification` → classify against the linked commitment (§5.5).
   - `idle` → classify as a general update; attempt to link to the person's most relevant open commitment; if ambiguous, ask which one (once).
6. Persist the inbound `messages` row with classification output.

**Global commands, checked before any classification:**
| Input (case-insensitive) | Action |
|---|---|
| `STOP`, `UNSUBSCRIBE`, `OPT OUT` | Set `whatsapp_opt_out_at`, cancel all queued sends, reply `optout_confirm`, increment `messaging_quota.opt_outs` |
| `START`, `RESUME` | Clear opt-out, confirm |
| `HELP` | Short explanation + link to the web app |
| `SKIP` | Exit the current survey cleanly |
| `STATUS` | Reply with the person's own open item count and nearest due date |

**Open-domain refusal (Meta AI policy, C-6):** if a message is unrelated to work coordination — general questions, chit-chat, requests for information — Loop replies once with: *"I only handle work check-ins and updates here. For anything else, the Loop app has more."* It does not engage. Loop is a purpose-specific business assistant, and it must behave like one to stay within Meta's terms.

---

## 6.6 Quality and tier management

A daily `housekeeping` job:
- Pulls the current messaging tier and quality rating from the Meta/Twilio API; stores on the tenant.
- Computes per-tenant opt-out rate and block rate over a rolling 7 days.
- **Above 2%:** automatically halve that tenant's daily send cap, notify tenant admins with the specific numbers, and raise an internal alert. Do not wait for Meta to drop the tier.
- **Above 3%:** suspend non-critical sends (general check-ins, surveys) for that tenant; allow only escalations. Require an admin to acknowledge before resuming.
- Surface all of this at `/settings/messaging` so an admin can see exactly why sending slowed.

**Tier ramp for a new tenant:** start conservatively regardless of the account's global tier — 50 messages/day for week 1, 150 for week 2, then the account tier. A new tenant blasting its whole team on day one is the fastest route to a quality-rating drop that affects every other tenant on the same number.
