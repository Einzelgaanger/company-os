# 09 — Connectors

## 9.1 Inventory and order

| Provider | Data | Phase | Status per audit | Action |
|---|---|---|---|---|
| Fathom | Meeting transcripts + participants | **1** | Webhook enqueues; worker does not persist | Persist. Per-tenant webhook ID. |
| Google Calendar | Events, attendees, recurrence | **2** | Edge OAuth stores tokens **plaintext** | Rebuild with envelope encryption |
| Microsoft Calendar (Graph) | Events, attendees | **2** | Not built | Build |
| Zoom | Cloud transcripts | 3 | Not built | Text only; audio never stored |
| Teams (Graph) | Meeting transcripts | 3 | Not built | |
| Slack | Allowlisted channels only | 4 | Not built | Never DMs |
| Drive / OneDrive | File **metadata only** | 4 | Not built | Corroboration signal (§4.10) |
| **Gmail / Outlook mail** | Headers + bodies | **7, gated** | Returns 501, flag off | **Correct. Leave it.** |
| Twilio WhatsApp | Send + inbound | **1** | Optional; falls back to `INAPP-*` ids | Make it real or fail loudly |

**The email gating is the one thing v2 got exactly right and the build honoured.** Gmail read access uses restricted OAuth scopes requiring an annual third-party security assessment before production use at scale, with a first cycle commonly running weeks. Keeping it behind `FEATURE_EMAIL_INGESTION=false` with a 501 is correct. Do not move it forward.

---

## 9.2 OAuth — rebuilt

The audit found tokens stored as plaintext `text` in `connections`, with a comment deferring encryption. That is the finding most likely to end a security review.

**Required implementation:**

```
GET  /api/connections/:provider/authorize   → { authUrl, state }
GET  /api/connections/:provider/callback    → exchange, encrypt, store, redirect
POST /api/connections/:id/disconnect        → revoke upstream, then delete locally
POST /api/connections/:id/reconnect         → re-authorize
```

**Rules:**
- PKCE on every provider.
- `state` is a signed single-use JWT, 10-minute TTL, carrying `tenant_id`, `user_id`, `provider`, nonce. Verify all four on callback. A callback whose `state` does not verify is dropped silently.
- Tokens stored in `bytea` via **KMS envelope encryption** — a data key per token, the data key itself encrypted by a master key. The columns are `access_token_enc` and `refresh_token_enc`, which is what `packages/db/0001_init.sql` already declares. The Supabase schema's plaintext `text` columns die with the archive.
- **Tokens are never returned by any API, ever.** Add a serializer denylist so it cannot happen by accident, and a test asserting no response body from any route contains a key matching `/token|secret|credential/i`.
- Proactive refresh at 75% of lifetime in `housekeeping`. Never lazy-on-failure — lazy refresh means the first user of the day gets the error.
- Refresh failure → `status = 'expired'`, in-app notification to the connection owner, banner on `/flow`. **A silently dead connector means Loop is quietly blind, which is worse than being visibly down.**

**Scopes — the audit marked these UNKNOWN and they must be verified before build.** Request read-only everywhere:

| Provider | Scope | Note |
|---|---|---|
| Google Calendar | `calendar.readonly` | Sensitive tier, not restricted |
| Google Drive | `drive.metadata.readonly` | Metadata only — never file content in v3 |
| Microsoft | `Calendars.Read`, `User.Read` | Requires verified publisher + admin consent |
| Gmail | *(phase 7)* | Restricted. Choose the narrowest scope that supports extraction, and verify current classification at build time — classifications change. |

Loop never requests a send, write, or delete scope on any provider. If a future feature seems to need one, that is a design discussion, not an implementation detail.

---

## 9.3 Webhooks

Per `01_CONSOLIDATION.md` §1.4 and `06_ENFORCEMENT.md` §6.2:

| Path | Tenant resolution | Signature | Idempotency |
|---|---|---|---|
| `POST /webhooks/whatsapp` | `To` number → `messaging_numbers` → tenant; then `From` → user **within that tenant only** | HMAC, unconditional | Provider message SID |
| `POST /webhooks/fathom/:webhookId` | Opaque per-tenant ID on `connections` | HMAC with that row's secret | Provider event ID |
| `POST /webhooks/email/:webhookId` | Same pattern | HMAC | Provider ID |

**No unsigned path exists in any environment.** Missing secret → 503 plus a configuration error, never a permissive fallback. The current behaviour — accept unsigned when no secret is set and `NODE_ENV !== 'production'` — is exactly the pattern that ships to production by accident.

**Never accept a tenant identifier from a request body.** CI grep enforces this.

---

## 9.4 Ingestion pipeline

Every source: **fetch → exclusion filter → normalize → store → enqueue extraction.**

**The exclusion filter runs before content is fetched.** If a meeting or thread matches a rule, the transcript or body is never retrieved. Fail closed: a filter error excludes the item.

**Visibility computation at ingestion:** `visibility_user_ids` = the internal participants. Everything derived from that source inherits it. A commitment whose owner is outside the source's visibility set is created with `review_required = true`, is never messaged about, and never appears on a dashboard until a human with source visibility confirms it.

This is the mechanism that answers "how do we stop a passing mention in an executive email from surfacing to the wrong person." It is enforced as a join condition on every commitment read, not as a UI filter.

**Test:** a meeting between two executives generates a commitment naming a third employee. Assert: (a) the employee does not see it, (b) their manager does not see it, (c) it is flagged for review, (d) no message is sent, (e) an executive with source visibility can confirm it.

---

## 9.5 Meetings — audio is never stored

Transcript **text** only. Recording URLs are not persisted, audio is never downloaded, and no tone, pitch, or prosody analysis exists anywhere in the codebase.

This is not a storage optimization. Inferring emotion from biometric signals — including voice — in a workplace is a prohibited practice under the EU AI Act, and the cleanest way to guarantee compliance is to make the data physically absent. Add a CI grep that fails on any reference to audio processing libraries.

---

## 9.6 Twilio

The audit found Loop falls back to `INAPP-*` message IDs when Twilio credentials are absent, meaning check-ins appear "sent" while never leaving the machine. In production that is a silent failure of the product's core function.

**Fix:** three explicit modes on `tenant_settings.messaging_mode`:

| Mode | Behaviour |
|---|---|
| `live` | Twilio configured. Missing credentials → the send job **fails loudly** into the DLQ and raises an alert. Never a silent fallback. |
| `in_app` | Deliberate. Check-ins appear in `/my-work` only. The UI says "WhatsApp is off for this workspace" everywhere a send would occur. |
| `sandbox` | Development. Messages render to a log viewer at `/admin/outbox`. Never available in production builds. |

The current implicit fallback is deleted. A tenant is always in a known, visible mode.

---

## 9.7 Connection health

`housekeeping`, every 30 minutes:
- Refresh tokens at 75% lifetime
- Mark `error` after 3 consecutive failures, with `last_error`
- Emit last-successful-sync age per tenant per provider
- Alert admins in-app and by email when any connection has not synced in 6 hours

`/integrations` shows per connection: status chip, connected account, relative last-sync time, and Reconnect. A broken connection also raises the persistent banner in the app shell, because a connector that fails quietly makes every other number on the screen wrong without saying so.
