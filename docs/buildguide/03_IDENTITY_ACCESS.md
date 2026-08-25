# 03 — Identity, Access, and Onboarding

## 3.1 Authentication methods

Three, in order of precedence per tenant:

1. **SSO (SAML 2.0 / OIDC)** — required for enterprise tenants. When `identity_connections.sso_enabled = true` and a user's email domain matches `sso_domains`, password login is **rejected** for that user. This prevents an SSO-bypass backdoor.
2. **Email + password** — pilot and small tenants. Argon2id hashing, minimum 12 characters, breach-list check against HaveIBeenPwned k-anonymity API on set/change.
3. **Google / Microsoft social login** — convenience for small tenants only; disabled when SSO is on.

**MFA:** TOTP required for `admin` and `owner` roles, optional for others, enforced at the tenant level via a setting. Recovery codes issued once at enrollment, stored hashed.

**Sessions:** short-lived JWT access token (15 min) + rotating refresh token (30 days, stored hashed in `sessions`). Refresh rotation with reuse detection: if a used refresh token is presented again, revoke the entire session family and force re-authentication. Log to `audit_log` as `session.reuse_detected`.

---

## 3.2 Authorization matrix

Four fixed roles. **No custom roles in v1** — note as a v2 item, do not build it.

| Capability | Member | Manager | Admin | Owner |
|---|:--:|:--:|:--:|:--:|
| View own commitments, check-ins, messages | ✅ | ✅ | ✅ | ✅ |
| View own data page (`/settings/my-data`) | ✅ | ✅ | ✅ | ✅ |
| Submit DSR (access/erasure) | ✅ | ✅ | ✅ | ✅ |
| Connect own integrations | ✅ | ✅ | ✅ | ✅ |
| Opt in/out of WhatsApp check-ins | ✅ | ✅ | ✅ | ✅ |
| Update own commitment status/progress | ✅ | ✅ | ✅ | ✅ |
| View direct reports' commitments | — | ✅ | ✅ | ✅ |
| View team project health | — | ✅ | ✅ | ✅ |
| Create/edit projects and milestones | — | Own team | ✅ | ✅ |
| Reassign a commitment owner | — | Own team | ✅ | ✅ |
| Trigger a manual check-in | — | Own team | ✅ | ✅ |
| Manually escalate | — | Own team | ✅ | ✅ |
| Acknowledge / resolve escalations | Assigned to them | Team's | ✅ | ✅ |
| View org-wide dashboard | — | — | ✅ | ✅ |
| Invite users, assign roles | — | — | ✅ (not Owner) | ✅ |
| Set a user's manager / team | — | — | ✅ | ✅ |
| Configure ownership map | — | — | ✅ | ✅ |
| Configure ingestion exclusions | — | — | ✅ | ✅ |
| Manage org-level connections | — | — | ✅ | ✅ |
| Configure SSO / SCIM | — | — | ✅ | ✅ |
| Approve survey questions | — | — | ✅ | ✅ |
| Configure report recipients & schedule | — | — | ✅ | ✅ |
| View reports | — | Team-scoped | ✅ | ✅ |
| View audit log | — | — | ✅ | ✅ |
| Handle DSRs for others | — | — | ✅ | ✅ |
| Set retention policy | — | — | ✅ | ✅ |
| Export all tenant data | — | — | — | ✅ |
| Billing & plan | — | — | — | ✅ |
| Delete tenant | — | — | — | ✅ |

**Implementation:** a single `can(user, action, resource)` function in `packages/shared/authz.ts`, driven by a declarative policy map. Every API route declares its required action. A route with no declared action fails closed at startup — add a boot-time assertion that enumerates all registered routes and throws if any lacks a policy binding.

**Scoping rules:**
- "Own team" = users where `manager_id = actor.id`, transitively down the management chain (recursive CTE, max depth 6 to prevent cycles), plus members of teams where `teams.lead_user_id = actor.id`.
- A manager never sees a peer's or a superior's individual commitments.
- **No role can retrieve a per-person performance score, because none exists** (C-1).

---

## 3.3 Admin invitation flow — full specification

This is the flow the customer's admin uses to bring people on. It must work for 5 people and for 500.

### 3.3.1 Single invite

**Entry:** `/settings/people` → "Invite people" button → modal.

**Fields:**
| Field | Type | Required | Default |
|---|---|---|---|
| Email | email input | Yes | — |
| Full name | text | No | Derived from SCIM/SSO on first login if blank |
| Role | select: Member / Manager / Admin | Yes | Member |
| Manager | user search select | No | — |
| Team | team select | No | — |
| Job title | text | No | — |

**Validation:**
- Email must not already exist as an active user in this tenant.
- An `admin` cannot issue an `owner` invite. Only an `owner` can, and only via `/settings/people` → transfer ownership (a separate, double-confirmed flow).
- If SSO is enabled and the email domain is not in `sso_domains`, warn: "This domain isn't covered by your SSO connection. They'll need a password to sign in."

**On submit:**
1. Create `invites` row with a 32-byte random token; store `sha256(token)` in `token_hash`, never the token.
2. `expires_at = now() + 7 days`.
3. Send invite email (template `invite_user`) containing `{APP_BASE_URL}/invite/{token}`.
4. Write `audit_log`: `user.invited`.
5. Toast: "Invite sent to {email}."

### 3.3.2 Bulk invite (CSV)

**Entry:** `/settings/people` → "Import from CSV".

- Accepted columns: `email,full_name,role,manager_email,team_name,job_title`. Only `email` is required.
- Show a **preview table** of parsed rows with per-row validation status before anything is sent. Invalid rows are highlighted with the reason and are skipped, not blocking.
- Cap: 1,000 rows per import. Above that, direct the admin to SCIM.
- Manager resolution: `manager_email` is matched against existing users **and** against other rows in the same import (two-pass — create all users first, then link managers).
- Sends are queued at 10/second to protect email reputation.
- Result screen: created / skipped / failed counts with a downloadable error CSV.

### 3.3.3 Invite acceptance

`/invite/:token`:
1. Hash the token, look up a non-expired, non-revoked, non-accepted `invites` row. Invalid → generic "This invite is no longer valid" (do not distinguish expired from wrong, to avoid enumeration).
2. Show org name and assigned role.
3. If SSO covers their domain → "Continue with SSO" button. Otherwise → set password form.
4. On success: create `users` row (`status = 'active'`), copy role/manager/team from the invite, mark invite accepted.
5. Continue to the onboarding wizard at step 2 (§3.5).

### 3.3.4 Managing existing people

`/settings/people` table: Name, Email, Role, Manager, Team, Status, Last active, WhatsApp opt-in state.

Actions: change role (inline, with confirm), set manager, set team, resend invite, revoke invite, suspend user, deprovision user.

**Guards:**
- Cannot demote or remove the last `owner` — block with copy `[C-LASTOWNER]`.
- Suspending a user immediately: revokes all their sessions, stops all scheduled check-ins to them, and reassigns nothing automatically (a human decides). Their open commitments are flagged `review_required = true` with reason `owner_suspended`.
- Deprovisioning is a soft delete (`deleted_at`), retaining commitments and their history for the organizational record, with the person's name replaced by "Former team member" in any view after 30 days unless legal hold is set.

---

## 3.4 SSO and SCIM

**Build vs buy: buy.** Use **WorkOS** for SAML/OIDC SSO and SCIM directory sync. A compliant SCIM server is fast to start and slow to finish — per-IdP quirks, pagination edge cases, schema extensions, and ongoing conformance as Okta and Entra change behaviour. That maintenance tail is not where this product's differentiation lives. Budget two weeks for integration versus six-plus for a home-built server plus perpetual maintenance.

If a self-hosted SCIM server is later required, it must implement RFC 7643 (schema) and RFC 7644 (protocol) — the requirements below apply either way.

### 3.4.1 SSO requirements
- SAML 2.0 and OIDC, per tenant, configured at `/settings/sso`.
- **IdP-initiated and SP-initiated** flows both supported.
- Attribute mapping: `email` (required), `firstName`, `lastName`, `groups`.
- **JIT provisioning** on first SSO login, creating the user with `default_role_on_jit` (default `member`), unless SCIM has already provisioned them.
- Single Logout (SLO) where the IdP supports it.
- XML parser hardened: external entity resolution disabled, entity expansion limited, signature verified against the configured certificate before any attribute is read.
- Assertion replay protection: cache assertion IDs for the assertion's validity window and reject repeats.
- Log every SAML failure with the specific reason (expired assertion, audience mismatch, wrong certificate, missing attribute, signature failure) — these are the top support tickets and generic errors make them unresolvable.

### 3.4.2 SCIM requirements
- Endpoints: `/scim/v2/Users` and `/scim/v2/Groups`, supporting `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, plus the `userName eq` filter and pagination (`startIndex`, `count`).
- Auth: bearer token, per tenant, generated in `/settings/sso`, shown **once**, stored hashed.
- **Deprovisioning is `PATCH active:false`, not `DELETE`.** Okta and Entra both deactivate this way. Implement `DELETE` for spec compliance, but the offboarding logic must trigger on `active: false` — this is the single most common implementation error and it means ex-employees keep access.
- **Every handler must be idempotent.** A directory migration can send thousands of events in minutes, with duplicates. Key on `externalId`; a create for an existing `externalId` is an update, not an error.
- **Soft delete only.** Deactivation sets `users.status = 'deprovisioned'`, revokes sessions, and cancels scheduled messages. It never hard-deletes commitment history.
- **Group → role mapping** via `identity_connections.scim_group_role_map`. An admin maps directory groups to Loop roles at `/settings/sso`. Unmapped groups are ignored, not defaulted to a privileged role.
- **Rate limiting:** accept bursts; queue processing rather than rejecting. Return `429` with `Retry-After` only above 100 requests/second per tenant.
- **Entra quirk:** Entra ID requires `?aadOptscim062020` appended to the endpoint URL for correct behaviour. Document this in the customer setup guide.
- **Observability:** a `/settings/sso` panel showing last sync time, users created/updated/deactivated in the last 24h, and any errors. Silent drift is the failure mode — a visible counter is the fix.

---

## 3.5 Onboarding

### 3.5.1 Organization onboarding (first user, becomes Owner)

A blocking, ordered wizard. The tenant status stays `provisioning` until it completes.

| Step | Route | Content | Skippable |
|---|---|---|---|
| 1 | `/onboarding/organization` | Org name, timezone, work days | No |
| 2 | `/onboarding/compliance` | **Compliance gate** — see below | **No** |
| 3 | `/onboarding/profile` | Name, job title, phone number | No |
| 4 | `/onboarding/whatsapp` | WhatsApp opt-in + OTP verification | Yes (feature degrades) |
| 5 | `/onboarding/connections` | Connect meeting tool + calendar | Yes |
| 6 | `/onboarding/exclusions` | Configure what Loop must never read | No |
| 7 | `/onboarding/ownership` | Define at least one escalation category | No |
| 8 | `/onboarding/people` | Invite team (single or CSV) | Yes |
| 9 | `/onboarding/reports` | Report recipients + schedule | Yes |
| 10 | `/onboarding/complete` | Summary + "Go to dashboard" | — |

**Step 2, the compliance gate, is a hard blocker.** The Owner must affirmatively confirm each of the following before `tenants.status` can become `active`:

- [ ] I confirm our lawful basis for this processing is **legitimate interest** (or select contract / legal obligation).
- [ ] I confirm a **Data Protection Impact Assessment** has been completed, or I will complete one before inviting employees. *(Template linked: `/docs/compliance/dpia-template.md`)*
- [ ] I confirm that where required by local law, **employee representatives / works council have been or will be consulted**.
- [ ] I confirm employees will be **informed** about what Loop does before their data is processed.
- [ ] I acknowledge that **Loop must not be used as the basis for promotion, discipline, or termination decisions**, and that doing so would make my organization the deployer of a high-risk AI system with independent legal obligations.
- [ ] I have identified our DPO or privacy contact: `[email input]`.

Writes to `tenant_compliance`. Record `attested_by_user_id` and `attested_at`. This record is the evidence artifact if a regulator ever asks, and it is what protects Loop as the processor.

**Step 6, exclusions, is also mandatory** and cannot be completed empty — the admin must either add at least one exclusion rule or explicitly tick "We have reviewed this and no exclusions are needed." Defaults are pre-populated as suggestions: HR, legal, payroll, and board-level distribution lists. See `04_INTEGRATIONS.md` §4.5.

### 3.5.2 Individual onboarding (invited user)

| Step | Route | Content | Skippable |
|---|---|---|---|
| 1 | `/onboarding/notice` | **Transparency notice** — see below | **No** |
| 2 | `/onboarding/profile` | Confirm name, job title, phone | No |
| 3 | `/onboarding/whatsapp` | WhatsApp opt-in + OTP | Yes |
| 4 | `/onboarding/connections` | Connect calendar / meeting tool | Yes |
| 5 | `/onboarding/complete` | "You're set" + link to `/settings/my-data` | — |

**Step 1 transparency notice — exact required content (C-3):**

> **What Loop does with your work data**
>
> Loop helps your team keep track of who's working on what, so nobody has to chase status manually.
>
> **What Loop reads:** meeting transcripts you're part of, your work calendar, and the connected work tools your organization has enabled. It does not read your personal accounts, your screen, your keystrokes, or anything your organization has excluded.
>
> **What Loop asks you:** short WhatsApp messages about how your work is going and what's blocking you. You choose whether to receive these, and you can turn them off at any time.
>
> **What your managers see:** the status of work items — what's done, what's late, what's blocked. They do not see a score, rating, or ranking of you. Loop does not produce one.
>
> **What leadership sees:** project progress and, where at least 5 people have responded, anonymous summaries of common themes people raised. Individual survey answers are never shown to anyone.
>
> **How long it's kept:** {retention_months_messages} months for messages, {retention_months_transcripts} months for transcripts.
>
> **Your rights:** you can see everything Loop holds about you at any time, and request correction or deletion, from **Settings → My data**.
>
> [ ] I've read this.   **[Continue]**

Store `notice_acknowledged_at` and `notice_version`. **No message is ever sent to a user, and no commitment is ever attributed to them, before this is acknowledged.** When the notice version changes, re-prompt on next login.

### 3.5.3 WhatsApp opt-in (C-6)

Opt-in is legally and platform-required, and it must be explicit and specific to WhatsApp.

1. Show: "Loop will message you on WhatsApp at {number} to check on work progress. Typically 2–3 short messages a week. Reply STOP at any time to turn this off."
2. Explicit checkbox: "Yes, message me on WhatsApp." — unchecked by default, never pre-ticked.
3. On tick → send OTP via template `otp_verify` → user enters 6-digit code → set `phone_verified_at` **and** `whatsapp_opt_in_at`.
4. Resend allowed after 30s, max 3 attempts per hour.
5. If skipped: the user still uses Loop fully in the web app; they simply receive no WhatsApp messages. Show a dismissible banner offering to enable it.
6. **Opt-out is honored immediately and permanently** until re-opted-in: an inbound "STOP" (or any message the classifier labels `opt_out`) sets `whatsapp_opt_out_at`, cancels all queued messages to that user, and sends one final confirmation. Increment `messaging_quota.opt_outs`.
