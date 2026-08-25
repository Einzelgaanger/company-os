# 04 — Integrations and Data Governance Filters

## 4.1 Connector inventory and build order

| Provider | Data | Scope tier | Phase | Notes |
|---|---|---|---|---|
| Fathom | Meeting transcripts + participants | API key | **1** | Primary source. Lowest friction, highest signal. |
| Google Calendar | Events, attendees, recurrence | Sensitive | **2** | Read-only. Identifies standups, due-date context. |
| Microsoft Calendar (Graph) | Events, attendees | Delegated read | **2** | Requires verified publisher + admin consent. |
| Zoom | Cloud recording transcripts | OAuth | 3 | Text transcript only. Audio never retained (C-2). |
| Microsoft Teams (Graph) | Meeting transcripts, channel messages | Delegated read | 3 | Transcript API requires policy grant. |
| Slack | Channel messages (selected channels only) | Bot token | 4 | Never DMs. Channel allowlist required. |
| Google Drive / OneDrive | File metadata + names only | Sensitive/Restricted | 4 | **Metadata only in v1.** Not content. |
| **Gmail** | Message headers + bodies | **Restricted** | **5, gated** | **Blocked on CASA — see §4.3.** |
| **Outlook mail** | Message headers + bodies | Delegated read | **5, gated** | Requires admin consent + security review. |

**Do not build 5 before 1–4 are in production.** Email is the highest-value and highest-risk source; it is deliberately last.

---

## 4.2 OAuth implementation

Standard authorization-code flow with PKCE for every provider.

```
GET  /api/connections/:provider/authorize   → returns { authUrl, state }
GET  /api/connections/:provider/callback    → exchanges code, stores tokens, redirects to /integrations
POST /api/connections/:id/disconnect        → revokes at provider, then deletes tokens locally
POST /api/connections/:id/reconnect         → re-runs authorize for an expired connection
```

**Rules:**
- `state` is a signed, single-use, 10-minute JWT containing `tenant_id`, `user_id`, `provider`, and a nonce. Verify all four on callback.
- Tokens are encrypted with **KMS envelope encryption** before storage: generate a data key per token, encrypt the token with it, store the encrypted data key alongside. `access_token_enc` and `refresh_token_enc` are `bytea` and are **never** included in any API response, log line, or error message. Add a serializer-level denylist so they cannot be leaked accidentally.
- Refresh runs proactively in the `housekeeping` queue at 75% of token lifetime, not lazily on failure.
- On refresh failure: set `status = 'expired'`, surface a "Reconnect needed" state in `/integrations`, and notify the connection owner in-app. Never silently stop syncing.
- **Disconnect revokes at the provider first**, then deletes locally. If provider revocation fails, still delete locally but log a `connection.revoke_failed` audit event.

---

## 4.3 Google restricted scopes and CASA (C-5)

Gmail read access uses **restricted OAuth scopes**. Google requires apps accessing restricted scopes from a third-party server to pass an annual **CASA** security assessment by a Google-approved assessor, with a Letter of Assessment, revalidated at least every 12 months. Assurance level is risk-based (AL1/AL2) and scales with user count and data-handling practices; once validated at the highest level, subsequent years stay there. First-time cycle commonly runs **6–12 weeks** including brand verification and remediation.

**Mandatory implementation decisions:**

1. **Request the narrowest scope that works.** Loop needs to *read* mail to extract commitments. It never sends, deletes, or modifies. Evaluate `gmail.readonly` versus `gmail.metadata` at build time and choose the least privileged option that supports extraction. A design decision that avoids the broadest scope (`https://mail.google.com/`) materially reduces assessment burden and cost. **Verify current scope classification against Google's published list at implementation time — classifications change.**

2. **Feature-flag email ingestion per tenant** (`tenant_flags.email_ingestion`). Default `false`. Google permits limited testing under 100 users pre-verification; the flag makes that boundary enforceable rather than aspirational.

3. **Architect so email is removable.** Every other feature must degrade gracefully with email off. Verify this with a test run of the full pipeline with the flag disabled.

4. **Prepare the assessment inputs during the build, not after:**
   - A written data-handling policy describing what is collected, why, retention, and deletion.
   - Encryption in transit and at rest, documented.
   - Access controls and least-privilege documented.
   - Incident reporting process.
   - A working DAST scan against a production-equivalent environment.
   - The CASA accelerator maps existing certifications (e.g. SOC 2, ISO 27001) to CASA requirements — pursuing SOC 2 first reduces CASA work.

5. **Microsoft equivalent:** register the app in Entra, become a **verified publisher**, request delegated read scopes (`Mail.Read`), and expect enterprise customers to require **admin consent** plus their own security review. Publisher verification is a prerequisite for many tenants' consent policies.

---

## 4.4 Ingestion pipeline per source

All sources converge on the same shape: fetch → **exclusion filter** → normalize → store → enqueue extraction.

### 4.4.1 Meetings (Fathom, Zoom, Teams)
1. Webhook or poll on completion.
2. Verify webhook signature (`FATHOM_WEBHOOK_SECRET`). Reject unsigned.
3. Idempotency check on `(tenant_id, provider, external_id)`.
4. **Run exclusion filter (§4.5). If excluded, write the `meetings` row with `status='excluded'` and stop — do not fetch or store the transcript.**
5. Fetch transcript **text only**. Store to S3, record `transcript_ref` and SHA-256. **Never store or process audio or video** (C-2).
6. Resolve participants to `users` by email. Mark `has_external_participants` when any participant is outside the tenant's verified domains.
7. **Compute `visibility_user_ids`** = the internal participants. This is the governance boundary: anything derived from this meeting is visible only to these people plus admins. A commitment extracted from a two-person exec meeting does not appear on a third person's dashboard.
8. Attempt project auto-link (§4.6). If no confident match, leave null.
9. Enqueue `extract`.

### 4.4.2 Calendar
1. Incremental sync via sync tokens (Google `syncToken`, Graph `deltaLink`). Never full-scan after the first sync.
2. Exclusion filter on calendar ID, attendee domain, and title pattern (e.g. anything containing "1:1", "personal", "medical", "interview" is excluded by default — pre-populate these).
3. Store event metadata only: title, time, attendees, recurrence. **Not** descriptions or attachments in v1 (they frequently contain sensitive content).
4. Use calendar to: detect recurring standups (for standup-prep messages), infer working hours, and supply due-date context to extraction.

### 4.4.3 Email (Phase 5, flagged)
1. Incremental sync via Gmail `historyId` / Graph delta.
2. **Exclusion filter runs before body fetch.** If the thread involves an excluded domain, address, or label, the body is never retrieved.
3. Store headers persistently; store body to S3 **temporarily**.
4. **Purge the body after extraction + 7-day grace period** (`body_purged_at`). Loop stores extracted commitments, not an email archive. This dramatically reduces breach blast radius and is a strong answer in every security review.
5. `visibility_user_ids` = internal participants on the thread.

### 4.4.4 Slack / Teams chat
1. **Channel allowlist only.** Never DMs, never private channels unless explicitly added by an admin.
2. Same exclusion filter, same visibility computation.

---

## 4.5 Governance exclusion filters — the answer to "how do we stop cross-contamination"

This is the mechanism that prevents content from one context leaking into another. It has two independent layers, and both are required.

### Layer 1 — Ingestion exclusion (never read it at all)

Configured at `/settings/data-governance` by an admin, mandatory during onboarding (§3.5.1 step 6). Stored in `ingestion_exclusions`.

**Rule types and matching:**
| Rule type | Matches | Example |
|---|---|---|
| `domain` | Any participant/sender/recipient at this domain | `lawfirm.com` |
| `email_address` | Exact address anywhere on the item | `hr@company.com` |
| `keyword` | Case-insensitive substring in subject or meeting title | `salary`, `disciplinary`, `grievance` |
| `label` | Gmail label / Outlook category | `Confidential` |
| `calendar_id` | An entire calendar | Personal calendar |
| `channel` | Slack/Teams channel | `#leadership-private` |
| `user` | Everything involving this person | The CEO's executive assistant |
| `team` | Everything involving this team | HR |
| `meeting_title_pattern` | Regex on meeting title | `^1:1` |

**Pre-populated defaults offered at onboarding** (admin accepts or edits):
`keyword`: salary, compensation, disciplinary, grievance, redundancy, termination, medical, sick leave, resignation, offer letter, appraisal, legal privilege, litigation, acquisition, diligence
`meeting_title_pattern`: `^1:1`, `(?i)one.to.one`, `(?i)performance review`, `(?i)interview`
`team`: HR, Legal (if such teams exist in the directory)

**Evaluation is fail-safe:** the filter runs **before** any content is fetched or sent to a model. If a rule matches, the item is recorded as `excluded` with the matching rule ID (for auditability) and no content is retrieved. If the filter itself errors, the item is **excluded**, not included — fail closed.

### Layer 2 — Derived-output visibility (read it, but scope who can see the result)

Ingestion exclusion handles categories. This handles the harder case in the original question: *a CEO-to-CEO email that mentions an employee in passing.*

**Rule: a derived item inherits the visibility of its source, always.**

- `meetings.visibility_user_ids` and `source_messages.visibility_user_ids` are computed at ingestion as the internal participants.
- Every `commitment` extracted from a source is visible **only** to: the source's `visibility_user_ids`, plus the commitment's owner and requester, plus tenant admins.
- Enforce this in the query layer as a mandatory join condition on every commitment read, not as a UI filter. Add it to the `can()` policy for `commitment.read`.
- **A commitment whose owner is not in the source's visibility set is created with `review_required = true`** and is not surfaced or messaged about until a human with source visibility confirms it. This is exactly the CEO-mentions-an-employee case: the system noticed something, but it does not act on it or expose it automatically.
- Aggregate reporting counts such items in project totals but **never quotes the source excerpt** outside the visibility set.

**Test case to implement** (`test/governance/visibility.spec.ts`): a meeting between two executives generates a commitment naming a third employee. Assert: (a) the third employee does not see it, (b) their manager does not see it, (c) it is flagged `review_required`, (d) no WhatsApp message is sent about it, (e) an executive with source visibility can see and confirm it.

---

## 4.6 Project auto-linking

Deterministic first, model only as a fallback, never as an authority.

1. **Explicit code match:** meeting title or email subject contains a `projects.code`. Confidence 1.0.
2. **Participant overlap:** ≥70% of internal participants are members of exactly one project's team. Confidence 0.8.
3. **Client name match:** external participant domain matches `projects.client_name` domain. Confidence 0.7.
4. **Model fallback:** ask the fast model to pick from a shortlist of the tenant's active project names given the title only (never the full transcript). Accept only if confidence ≥ 0.75.
5. Below threshold → `project_id = NULL`, `project_link_method = 'none'`. A human links it from `/projects/:id`. Unlinked items still track fine; they just do not roll into a project's progress figure.

---

## 4.7 Connection health

A `housekeeping` job every 30 minutes:
- Refreshes tokens at 75% lifetime.
- Marks `status='error'` with `last_error` after 3 consecutive sync failures.
- Emits a metric per tenant per provider: last successful sync age.
- Alerts (Sentry + in-app notification to admins) when any connection has not synced in 6 hours.

`/integrations` shows per connection: status pill, connected account, last sync time (relative), and a "Reconnect" action. When a connection is broken, the dashboard shows a persistent banner — a silently broken connector means Loop is quietly blind, which is worse than being visibly down.
