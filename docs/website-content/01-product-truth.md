# Phase 1: Product truth

Evidence from codebase and `COMPANY_OS_DOSSIER.md`. Plain language. No marketing tone.

## Core answers

### 1. What is it?
Company OS is a multi-tenant work coordination product. It turns meetings and chat into owned commitments (who owes what by when), follows up with people on messaging channels or in-app Chat, escalates blockers with context to the right person, and generates leadership reports. The SPA lives under `src/`. Production automation lives mainly in Supabase Edge Functions under `supabase/functions/`.

### 2. Who uses it?
Roles in code (`src/lib/types.ts`): **owner**, **admin**, **manager**, **member**. Managers and admins see review queues, team, reports and settings. Members see their work and Chat. Onboarding and coordination modes tune cadence (`src/pages/onboarding/Coordination.tsx`).

### 3. Who buys it?
Workspace creator (owner) pays or provisions the org. Exact commercial buyer is not proven in code. See `00-open-questions.md` Q1.

### 4. What problem does it remove?
Commitments die in threads and meetings. Waiting is invisible. People chase updates. Escalations lack context. Leaders get optimistic status instead of an operating picture.

### 5. What would they do without it?
Slack/Telegram threads, spreadsheets, manual PM chase, meeting-note tools alone (Fathom/Otter/Fireflies without follow-through), Asana/Linear/Notion as pull boards without proactive messaging.

### 6. How does it work? (3–5 steps)
1. Ingest meetings/chat (e.g. Fathom) and extract commitments with confidence and review gates (`extract-commitments`).
2. Store commitments with owner, requester, due date, status (`commitments` table).
3. Check in via preferred channel or Chat (`send-checkin`, `chat-inbound`, Telegram/WhatsApp webhooks).
4. Classify replies; escalate blocked work via ownership map with sensitivity redaction (`inboundReply`, `escalate`).
5. Generate daily/weekly reports for leads (`generate-report`).

### 7. First win
After signup and invite: create or extract a commitment, open `/chat`, reply to a check-in, see status update. Optional: link Telegram. Evidence: onboarding routes, `Chat.tsx`, `SettingsProfile.tsx`.

### 8. What is uniquely possible here?
Proactive messaging follow-through plus context-aware escalation and governed reports, not only a task board or a transcript. Per-person preferred channel (Chat / Telegram / WhatsApp) with one synced thread (`src/lib/messaging.ts`, `checkins`).

### 9. What has changed recently (site may miss)?
In-app Chat and preferred channels; connector catalog expansion; surveys; tag audiences / ingestion rules; richer escalations and project progress Edge functions; Google OAuth and Render/Supabase production path. See git log `dd3e21d`–`9fd050a` and Chat launch work.

### 10. What it does not do?
Not HR performance scoring. Not a generic chat app for person-to-person DMs (Chat is Company OS ↔ person). WhatsApp may not be Meta-live for every deploy. Fastify/BullMQ stack is secondary. Email as primary check-in is unclear (Q6).

---

## Capability Inventory

| # | Capability | Plain-language description | User outcome | Evidence | Status | Proof available |
|---|---|---|---|---|---|---|
| C1 | Commitment tracking | Store who owes what by when with status and sensitivity | Follow-through is visible | `0001_schema.sql`, `db.supabase.ts`, `Commitments.tsx` | Shipped | Screenshot |
| C2 | Meeting extraction | LLM extracts commitments with quotes and review flags | Meeting notes become owned work | `extract-commitments/index.ts` | Shipped | Demo |
| C3 | Review queue | Managers approve/reject low-confidence AI items | Bad extracts do not spam people | `ReviewQueue.tsx` | Shipped | Screenshot |
| C4 | In-app Chat | Same thread as bots; default channel for launch | Use product without Meta WhatsApp | `Chat.tsx`, `chat-inbound` | Shipped | Demo |
| C5 | Preferred channel | Per-user Chat / Telegram / WhatsApp preference | Each person is reached where they work | `messaging.ts`, `SettingsProfile.tsx`, `_shared/whatsapp.ts` | Shipped | Screenshot |
| C6 | Telegram messaging | Link by phone; send/receive check-ins | Async follow-up on Telegram | `telegram-webhook`, `inboundReply.ts` | Shipped | Demo (ops) |
| C7 | WhatsApp messaging | Meta/Twilio send/receive when configured | Same loop on WhatsApp | `whatsapp-webhook`, `_shared/whatsapp.ts` | Beta | `[NEEDS INPUT: Meta live?]` |
| C8 | Scheduled check-ins | Cron pings overdue/stale commitments | Silence does not calcify | `send-checkin`, `0006_cron.sql` | Shipped | None |
| C9 | Escalation routing | Ownership map + manager/admin fallback | Stuck work reaches the right person | `escalate/index.ts` | Shipped | Screenshot |
| C10 | Sensitivity redaction | Escalate with redacted context by clearance | Safer escalation of confidential work | `escalate/index.ts` | Shipped | None |
| C11 | Leadership reports | Daily/weekly markdown reports + themes | Leads see waiting and blockers | `generate-report/index.ts`, `Reports.tsx` | Shipped | Screenshot |
| C12 | Flow / Waiting | Working vs waiting views | Operators see what is stuck | `Flow.tsx`, `Waiting.tsx` | Shipped | Screenshot |
| C13 | Projects | Project list/detail and health | PMs scope work by project | `Projects.tsx` | Shipped | Screenshot |
| C14 | Fathom ingest | Webhook → meeting → extract | Transcripts enter the loop | `fathom-webhook`, `ingest-meeting` | Shipped | Ops |
| C15 | Calendar sync | Google/Microsoft events into DB | Calendar context available | `sync-calendar`, `oauth` | Shipped | Ops |
| C16 | Integrations UI | Connect work sources | Operators wire tools | `Integrations.tsx` | Shipped | Screenshot |
| C17 | Roles and RLS | Org-scoped roles and policies | Multi-team isolation | `types.ts`, archive RLS, packages/db FORCE RLS | Shipped | None |
| C18 | Google OAuth login | Sign in with Google via Supabase | Faster signup | `GoogleOAuthButton.tsx`, `AuthCallback.tsx` | Shipped | Demo |
| C19 | Onboarding + coordination modes | Org setup and cadence modes | Fits how the company coordinates | `onboarding/*`, `coordination.ts` | Shipped | Screenshot |
| C20 | Surveys | Survey cycles and review | Pulse without performance scorecards | `Surveys.tsx`, Edge survey fns | Beta | Screenshot |
| C21 | Governance / tags | Sensitivity and tags on work | Controlled visibility | `Governance.tsx`, tag migrations | Shipped | Screenshot |
| C22 | Messaging eligibility | Opt-in, caps, quiet hours | Less spam | `packages/messaging/eligibility.ts` | Shipped | None |
| C23 | Ownership map settings | Configure escalation categories | Predictable routing | `SettingsOwnershipMap.tsx` | Shipped | Screenshot |
| C24 | Digest | Morning digest sends | Lightweight daily picture | `send-digest` | Shipped | Ops |
| C25 | Legal / privacy pages | Public privacy and terms | Trust baseline | `Privacy.tsx`, `Terms.tsx` | Shipped | Live |

---

## Product vocabulary

| App term | Customer term (site default) | Notes |
|---|---|---|
| Commitment | Promise / commitment | Prefer "commitment" as named feature; "promise" in outcomes |
| Check-in | Check-in / prompt | Keep "check-in" |
| Escalation | Escalation / unblock | Prefer "unblock" in headlines |
| Flow / Waiting | Waiting / what is stuck | Prefer plain "waiting" on site |
| preferred_channel | Messaging channel | Customer: Chat, Telegram, WhatsApp |
| Review queue | Review queue | OK as feature name |
| Agentic chief of staff | Chief of staff (software) | Keep brand slogan; explain in subhead |
| Ownership map | Who gets escalations | Explain once |

Voice harvest (adjectives): calm, specific, operational, human, governed, anti-chase, anti-scorecard.
