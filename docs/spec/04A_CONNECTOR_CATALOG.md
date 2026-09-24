# 04A — Connector catalogue

Companion to `04_INTEGRATIONS.md`. That document defines *how* ingestion works;
this one is the inventory of *what* can be connected, and what each connection costs
an operator in setup.

**Source of truth is code, not this table.** The catalogue lives in three files that
`npm run check:connectors` keeps identical, and this page is regenerated from them:

| File | Owns |
| --- | --- |
| `src/lib/providers.ts` | ids, names, categories, user-facing copy, brand mark |
| `apps/api/src/lib/providerRegistry.ts` | endpoints, scopes, env vars, probes |
| `packages/db/migrations/0007_connector_catalog.sql` | the `provider` CHECK constraint |
| `supabase/functions/_shared/providers.generated.ts` | projection of the registry for the Supabase plane |

---

## 4A.1 Rules that hold for every connector

- **Read-only.** No send, write, delete, or manage scope is requested anywhere. CI
  fails on a scope containing one of those words (`scripts/checks/connectors.mjs`).
- **PKCE** on every provider that supports it; `state` is a signed, single-use,
  10-minute JWT carrying tenant, user, provider and nonce.
- **Credentials are encrypted at rest** with `TOKEN_ENCRYPTION_KEY` (AES-256-GCM
  envelope) and are never returned by any API. That covers OAuth access and refresh
  tokens, pasted API keys, and webhook signing secrets.
- **Missing credentials mean unavailable, not degraded.** A connector with no client
  id shows "needs setup" on `/integrations` and its authorize route answers `503`
  with the exact missing env var names.
- **Storage connectors read metadata only.** Drive, OneDrive, SharePoint, Dropbox and
  Box return names, owners and edit times — never file content.
- **Meetings store transcript text only.** No audio is downloaded, and no tone or
  prosody analysis exists anywhere in the codebase (§9.5).
- **Gmail and Outlook stay behind `FEATURE_EMAIL_INGESTION`** until the CASA
  assessment completes. They appear in the catalogue as "available after review".

## 4A.2 The three auth shapes

| Shape | Flow | Where the secret lives |
| --- | --- | --- |
| `oauth2` | `GET /connections/:provider/authorize` → provider consent → `GET /connections/:provider/callback` | `access_token_enc`, `refresh_token_enc` |
| `api_key` | `POST /connections/:provider/credentials` — validated against the provider before it is stored | `api_key_enc` |
| `webhook` | `POST /connections/:provider/webhook` — mints an opaque per-tenant path id and a signing secret shown exactly once | `webhook_secret_enc` |

Per-customer hosts (Zendesk subdomain, Shopify shop, Okta org, self-managed GitLab,
Salesforce login domain) come from the connector's `instanceEnv`, substituted into
`{instance}` in its endpoints.

## 4A.3 Inventory

| id | Name | Category | Auth | Scope | Read access requested | Deployment setup |
| --- | --- | --- | --- | --- | --- | --- |
| `gmail` | Gmail | Email | oauth2 | personal | gmail.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `outlook` | Outlook | Email | oauth2 | personal | Mail.Read | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| `front` | Front | Email | oauth2 | workspace | read | `FRONT_OAUTH_CLIENT_ID`, `FRONT_OAUTH_CLIENT_SECRET` |
| `google_calendar` | Google Calendar | Calendar | oauth2 | personal | calendar.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `microsoft_calendar` | Microsoft Calendar | Calendar | oauth2 | personal | Calendars.Read, User.Read | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| `calendly` | Calendly | Calendar | oauth2 | personal | default (read) | `CALENDLY_OAUTH_CLIENT_ID`, `CALENDLY_OAUTH_CLIENT_SECRET` |
| `zoom` | Zoom | Meetings | oauth2 | personal | meeting:read, recording:read | `ZOOM_OAUTH_CLIENT_ID`, `ZOOM_OAUTH_CLIENT_SECRET` |
| `google_meet` | Google Meet | Meetings | oauth2 | personal | meetings.space.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `webex` | Webex | Meetings | oauth2 | personal | meeting:schedules_read, meeting:recordings_read | `WEBEX_OAUTH_CLIENT_ID`, `WEBEX_OAUTH_CLIENT_SECRET` |
| `fathom` | Fathom | Meetings | webhook | workspace | recordings.read (transcript text only) | minted per workspace |
| `gong` | Gong | Meetings | api_key | workspace | api:calls:read:basic, api:calls:read:transcript | pasted per workspace |
| `loom` | Loom | Meetings | api_key | workspace | read-only workspace token | pasted per workspace |
| `slack` | Slack | Messaging | oauth2 | workspace | channels:history, channels:read, users:read | `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET` |
| `teams` | Microsoft Teams | Messaging | oauth2 | workspace | ChannelMessage.Read.All | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| `google_chat` | Google Chat | Messaging | oauth2 | workspace | chat.spaces.readonly, chat.messages.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `discord` | Discord | Messaging | oauth2 | workspace | identify, guilds, messages.read | `DISCORD_OAUTH_CLIENT_ID`, `DISCORD_OAUTH_CLIENT_SECRET` |
| `telegram` | Telegram | Messaging | api_key | workspace | bot token (send + receive check-ins) | pasted per workspace |
| `whatsapp` | WhatsApp | Messaging | api_key | workspace | Cloud API phone number + app secret | pasted per workspace |
| `twilio` | Twilio | Messaging | api_key | workspace | Account SID + auth token | pasted per workspace |
| `jira` | Jira | Project tracking | oauth2 | workspace | read:jira-work, read:jira-user | `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET` |
| `asana` | Asana | Project tracking | oauth2 | workspace | tasks:read, projects:read, users:read | `ASANA_OAUTH_CLIENT_ID`, `ASANA_OAUTH_CLIENT_SECRET` |
| `linear` | Linear | Project tracking | oauth2 | workspace | read | `LINEAR_OAUTH_CLIENT_ID`, `LINEAR_OAUTH_CLIENT_SECRET` |
| `monday` | monday.com | Project tracking | oauth2 | workspace | boards:read, users:read | `MONDAY_OAUTH_CLIENT_ID`, `MONDAY_OAUTH_CLIENT_SECRET` |
| `clickup` | ClickUp | Project tracking | oauth2 | workspace | read-only app token | `CLICKUP_OAUTH_CLIENT_ID`, `CLICKUP_OAUTH_CLIENT_SECRET` |
| `trello` | Trello | Project tracking | api_key | workspace | API key + read token | pasted per workspace |
| `basecamp` | Basecamp | Project tracking | oauth2 | workspace | read-only account access | `BASECAMP_OAUTH_CLIENT_ID`, `BASECAMP_OAUTH_CLIENT_SECRET` |
| `todoist` | Todoist | Project tracking | oauth2 | personal | data:read | `TODOIST_OAUTH_CLIENT_ID`, `TODOIST_OAUTH_CLIENT_SECRET` |
| `shortcut` | Shortcut | Project tracking | api_key | workspace | read-only API token | pasted per workspace |
| `notion` | Notion | Docs & knowledge | oauth2 | workspace | read content (per-page grant) | `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET` |
| `confluence` | Confluence | Docs & knowledge | oauth2 | workspace | read:confluence-content.summary | `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET` |
| `google_docs` | Google Docs | Docs & knowledge | oauth2 | personal | documents.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `google_sheets` | Google Sheets | Docs & knowledge | oauth2 | personal | spreadsheets.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `coda` | Coda | Docs & knowledge | api_key | workspace | read-only API token | pasted per workspace |
| `airtable` | Airtable | Docs & knowledge | oauth2 | workspace | data.records:read, schema.bases:read | `AIRTABLE_OAUTH_CLIENT_ID`, `AIRTABLE_OAUTH_CLIENT_SECRET` |
| `google_drive` | Google Drive | Storage | oauth2 | personal | drive.metadata.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `onedrive` | OneDrive | Storage | oauth2 | personal | Files.Read.All | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| `sharepoint` | SharePoint | Storage | oauth2 | workspace | Sites.Read.All | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| `dropbox` | Dropbox | Storage | oauth2 | personal | files.metadata.read | `DROPBOX_OAUTH_CLIENT_ID`, `DROPBOX_OAUTH_CLIENT_SECRET` |
| `box` | Box | Storage | oauth2 | personal | root_readonly | `BOX_OAUTH_CLIENT_ID`, `BOX_OAUTH_CLIENT_SECRET` |
| `hubspot` | HubSpot | CRM & sales | oauth2 | workspace | crm.objects.deals.read, crm.objects.contacts.read | `HUBSPOT_OAUTH_CLIENT_ID`, `HUBSPOT_OAUTH_CLIENT_SECRET` |
| `salesforce` | Salesforce | CRM & sales | oauth2 | workspace | api, refresh_token (read-only profile) | `SALESFORCE_OAUTH_CLIENT_ID`, `SALESFORCE_OAUTH_CLIENT_SECRET`, `SALESFORCE_LOGIN_DOMAIN` |
| `pipedrive` | Pipedrive | CRM & sales | oauth2 | workspace | deals:read, activities:read, users:read | `PIPEDRIVE_OAUTH_CLIENT_ID`, `PIPEDRIVE_OAUTH_CLIENT_SECRET` |
| `zoho_crm` | Zoho CRM | CRM & sales | oauth2 | workspace | ZohoCRM.modules.READ | `ZOHO_OAUTH_CLIENT_ID`, `ZOHO_OAUTH_CLIENT_SECRET`, `ZOHO_ACCOUNTS_DOMAIN` |
| `docusign` | DocuSign | CRM & sales | oauth2 | workspace | signature (read), impersonation off | `DOCUSIGN_OAUTH_CLIENT_ID`, `DOCUSIGN_OAUTH_CLIENT_SECRET`, `DOCUSIGN_AUTH_DOMAIN` |
| `zendesk` | Zendesk | Support | oauth2 | workspace | read | `ZENDESK_OAUTH_CLIENT_ID`, `ZENDESK_OAUTH_CLIENT_SECRET`, `ZENDESK_SUBDOMAIN` |
| `intercom` | Intercom | Support | oauth2 | workspace | read conversations, read admins | `INTERCOM_OAUTH_CLIENT_ID`, `INTERCOM_OAUTH_CLIENT_SECRET` |
| `helpscout` | Help Scout | Support | oauth2 | workspace | read | `HELPSCOUT_OAUTH_CLIENT_ID`, `HELPSCOUT_OAUTH_CLIENT_SECRET` |
| `github` | GitHub | Engineering | oauth2 | workspace | read:org, repo:status, read:user | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` |
| `gitlab` | GitLab | Engineering | oauth2 | workspace | read_api, read_user | `GITLAB_OAUTH_CLIENT_ID`, `GITLAB_OAUTH_CLIENT_SECRET`, `GITLAB_BASE_DOMAIN` |
| `bitbucket` | Bitbucket | Engineering | oauth2 | workspace | repository, pullrequest (read) | `BITBUCKET_OAUTH_CLIENT_ID`, `BITBUCKET_OAUTH_CLIENT_SECRET` |
| `sentry` | Sentry | Engineering | api_key | workspace | org:read, project:read, event:read | pasted per workspace |
| `pagerduty` | PagerDuty | Engineering | oauth2 | workspace | incidents.read, users.read | `PAGERDUTY_OAUTH_CLIENT_ID`, `PAGERDUTY_OAUTH_CLIENT_SECRET` |
| `datadog` | Datadog | Engineering | api_key | workspace | API key + application key (read) | pasted per workspace |
| `figma` | Figma | Design | oauth2 | personal | files:read | `FIGMA_OAUTH_CLIENT_ID`, `FIGMA_OAUTH_CLIENT_SECRET` |
| `miro` | Miro | Design | oauth2 | workspace | boards:read | `MIRO_OAUTH_CLIENT_ID`, `MIRO_OAUTH_CLIENT_SECRET` |
| `greenhouse` | Greenhouse | People | api_key | workspace | Harvest API key (read) | pasted per workspace |
| `gusto` | Gusto | People | oauth2 | workspace | employees:read, time_off:read | `GUSTO_OAUTH_CLIENT_ID`, `GUSTO_OAUTH_CLIENT_SECRET`, `GUSTO_API_DOMAIN` |
| `personio` | Personio | People | api_key | workspace | client credentials (read) | pasted per workspace |
| `stripe` | Stripe | Finance | api_key | workspace | restricted key, read-only | pasted per workspace |
| `quickbooks` | QuickBooks | Finance | oauth2 | workspace | com.intuit.quickbooks.accounting (read) | `QUICKBOOKS_OAUTH_CLIENT_ID`, `QUICKBOOKS_OAUTH_CLIENT_SECRET` |
| `xero` | Xero | Finance | oauth2 | workspace | accounting.transactions.read | `XERO_OAUTH_CLIENT_ID`, `XERO_OAUTH_CLIENT_SECRET` |
| `shopify` | Shopify | Finance | oauth2 | workspace | read_orders, read_products | `SHOPIFY_OAUTH_CLIENT_ID`, `SHOPIFY_OAUTH_CLIENT_SECRET`, `SHOPIFY_SHOP_DOMAIN` |
| `mailchimp` | Mailchimp | Marketing & forms | oauth2 | workspace | read-only account access | `MAILCHIMP_OAUTH_CLIENT_ID`, `MAILCHIMP_OAUTH_CLIENT_SECRET` |
| `sendgrid` | SendGrid | Marketing & forms | api_key | workspace | read-only API key | pasted per workspace |
| `typeform` | Typeform | Marketing & forms | oauth2 | workspace | forms:read, responses:read | `TYPEFORM_OAUTH_CLIENT_ID`, `TYPEFORM_OAUTH_CLIENT_SECRET` |
| `google_forms` | Google Forms | Marketing & forms | oauth2 | personal | forms.responses.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `google_analytics` | Google Analytics | Analytics | oauth2 | workspace | analytics.readonly | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `mixpanel` | Mixpanel | Analytics | api_key | workspace | service account (read) | pasted per workspace |
| `amplitude` | Amplitude | Analytics | api_key | workspace | API key + secret key (read) | pasted per workspace |
| `segment` | Segment | Analytics | api_key | workspace | Public API token (read) | pasted per workspace |
| `okta` | Okta | Identity | oauth2 | workspace | okta.users.read, okta.groups.read | `OKTA_OAUTH_CLIENT_ID`, `OKTA_OAUTH_CLIENT_SECRET`, `OKTA_DOMAIN` |
| `auth0` | Auth0 | Identity | oauth2 | workspace | read:users, read:roles | `AUTH0_OAUTH_CLIENT_ID`, `AUTH0_OAUTH_CLIENT_SECRET`, `AUTH0_DOMAIN` |
| `workos` | WorkOS | Identity | api_key | workspace | API key + client ID | pasted per workspace |
| `zapier` | Zapier | Automation | webhook | workspace | signed inbound webhook | minted per workspace |
| `make` | Make | Automation | webhook | workspace | signed inbound webhook | minted per workspace |
| `n8n` | n8n | Automation | webhook | workspace | signed inbound webhook | minted per workspace |

## 4A.4 The two planes

OAuth runs in both stacks, from the same registry:

| | Fastify (`apps/api`) | Supabase edge (`functions/oauth`) |
| --- | --- | --- |
| Source of endpoints | `providerRegistry.ts` | `_shared/providers.generated.ts` (projected from it) |
| OAuth connectors | 54 | 54 |
| `api_key` / `webhook` connectors | yes | **no** — the SPA only offers those when the API is reachable |
| State signing | JWT (`jose`) | HMAC-SHA256, same 10-minute TTL |
| Credential storage | `TOKEN_ENCRYPTION_KEY` | `TOKEN_ENCRYPTION_KEY` (same `iv:tag:data` envelope) |

Supabase secrets the connector layer needs:

- `TOKEN_ENCRYPTION_KEY` — **required.** Without it `functions/oauth` answers `503
  token_encryption_not_configured` rather than writing a plaintext token, and
  `launch-readiness` reports it as missing. Rows written before encryption shipped are
  still readable: `decryptToken` passes through anything that is not in envelope format,
  and re-encrypts on the next refresh.
- `OAUTH_STATE_SECRET` — signs the `state` blob. Falls back to the service role key.
- `PUBLIC_APP_URL` — where the callback redirects back to.
- One `*_OAUTH_CLIENT_ID` / `*_OAUTH_CLIENT_SECRET` pair per provider family, plus any
  `instance` secret from the table above.

## 4A.5 Adding a connector

1. Add the entry to `src/lib/providers.ts` (including the Iconify `icon` name).
2. Add the matching definition to `apps/api/src/lib/providerRegistry.ts`.
3. Add the id to the `provider` CHECK constraint in a new migration.
4. `npm run gen:icons` to vendor the brand mark, and `npm run gen:edge-providers` to
   refresh the Supabase projection.
5. `npm run check:connectors` — it fails on any of the above being missed.
