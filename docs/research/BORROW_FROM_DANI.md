# What Loop borrows from DANI

Loop stays the **commitment OS** (check-in → nudge → escalate → report + governance).
DANI stays the **RAG meeting-intelligence product**. We do **not** port chat, deals CRM, contacts CRM, ghostwriter, or infographics.

## Borrow now (building)

| DANI capability | Why Loop needs it | Loop destination |
|---|---|---|
| Meeting classification (catch-up / project / deal / follow-up) | Stop fake tasks from coffee chats | `meetings.category` + skip extract on catch-up |
| Confidence score + review queue | #1 VGG/RedTech pain: useless Fireflies items | `commitments.confidence_score`, `needs_review` + `/review` |
| Source quote | Traceability / trust | `commitments.source_quote` |
| Assignee resolution (email → name → participant) | Owners stick | stronger resolve in extract + UI confirm |
| Feedback (accurate / incorrect) | Continuous quality | `commitment_feedback` |
| Dependencies / blockers | Surface chains before delay | `commitment_dependencies` |
| Status history with channel | Audit + WhatsApp/UI parity | `commitment_status_history` |
| Daily digest (overdue / due today / upcoming) | Morning brief without RAG | cron + in-app/WhatsApp digest |
| Recency guard on outbound | DANI Jul-2 blast lesson | skip check-ins/emails for stale meetings |
| Natural-language status (done / blocked / snooze) | WhatsApp-native updates | richer `classifyResponse` |

## Borrow later (patterns only)

- External assignee token update link
- Post-extraction hook registry shape
- Meta WhatsApp templates (when Twilio/Meta ready)
- Calendar scheduling intent → placeholder events
- Workstreams (group commitments under a deal/project stream)

## Never borrow into Loop

RAG chat, Qdrant, ghostwriter, infographics, deal Kanban, contacts CRM, distribution/inception marketing, PI MCP.
If those are needed, call DANI as an upstream (extract → Loop commitments API).
