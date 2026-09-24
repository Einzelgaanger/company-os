/**
 * Connector registry — the API half of the source of truth.
 *
 * Every id here must exist in src/lib/providers.ts and in the provider CHECK
 * constraint in packages/db/migrations. `npm run check:connectors` enforces it.
 *
 * Rules that hold for every entry (docs/design/09_CONNECTORS.md §9.2):
 *  · read-only scopes only — no send, write, delete, or manage scope, ever
 *  · PKCE wherever the provider supports it
 *  · credentials live in env vars, never in code, never in the database as plaintext
 *  · a connector with missing env is *unavailable*, never silently degraded
 *
 * Endpoints are transcribed from each provider's OAuth documentation; `docs` on
 * each entry is the page to re-check when a provider migrates its endpoints.
 */

export type ProviderAuthKind = "oauth2" | "api_key" | "webhook";

/** Where the client credentials are presented at the token endpoint. */
export type ClientAuthStyle = "body" | "basic";

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  /** Read-only scopes. Empty array = provider has no scope parameter. */
  scopes: string[];
  clientAuth: ClientAuthStyle;
  pkce: boolean;
  /** Extra static params on the authorize request. */
  authorizeParams?: Record<string, string>;
  /** Some providers only return JSON when asked (GitHub). */
  jsonAccept?: boolean;
  /** GET probe used to record which account was connected. */
  identityUrl?: string;
  /** Path into the identity response, e.g. ["data", "email"]. */
  identityPath?: string[];
  /** Path into the *token* response, for providers that name the account there. */
  identityFromToken?: string[];
  revokeUrl?: string;
  /** Token endpoint wants the scope repeated (Microsoft-style refresh). */
  scopeOnRefresh?: boolean;
}

export type ApiKeyProbeAuth = "bearer" | "basic" | "header" | "url" | "none";

export interface ApiKeyConfig {
  /** What the admin pastes, in words. Shown in the UI. */
  hint: string;
  /** Validation call. Omitted when the provider has no cheap read endpoint. */
  probeUrl?: string;
  probeAuth: ApiKeyProbeAuth;
  /** Header name when probeAuth === "header". */
  probeHeader?: string;
  /** Path into the probe response for the account label. */
  identityPath?: string[];
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  auth: ProviderAuthKind;
  /** One connection per workspace rather than per person. */
  orgLevel: boolean;
  /** Env var names for the OAuth client. */
  clientIdEnv?: string;
  clientSecretEnv?: string;
  /**
   * Providers hosted per customer (Zendesk, Shopify, Okta, self-managed GitLab).
   * `{instance}` in any URL is replaced with this env var's value.
   */
  instanceEnv?: string;
  /** Connector stays unavailable until this env var is "true". */
  featureFlag?: string;
  oauth?: OAuthConfig;
  apiKey?: ApiKeyConfig;
  docs: string;
}

// ── Provider-family builders ────────────────────────────────────────────────

const GOOGLE_IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
];

function google(scopes: string[]): OAuthConfig {
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [...scopes, ...GOOGLE_IDENTITY_SCOPES],
    clientAuth: "body",
    pkce: true,
    authorizeParams: { access_type: "offline", prompt: "consent" },
    identityUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    identityPath: ["email"],
    revokeUrl: "https://oauth2.googleapis.com/revoke",
  };
}

/** Microsoft identity platform v2. Tenant comes from MICROSOFT_TENANT_ID. */
function microsoft(scopes: string[]): OAuthConfig {
  return {
    authorizeUrl:
      "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    scopes: ["offline_access", "User.Read", ...scopes],
    clientAuth: "body",
    pkce: true,
    authorizeParams: { response_mode: "query" },
    identityUrl: "https://graph.microsoft.com/v1.0/me",
    identityPath: ["mail"],
    scopeOnRefresh: true,
  };
}

/** Atlassian OAuth 2.0 (3LO) — Jira, Confluence. */
function atlassian(scopes: string[]): OAuthConfig {
  return {
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: [...scopes, "offline_access"],
    clientAuth: "body",
    pkce: false,
    authorizeParams: { audience: "api.atlassian.com", prompt: "consent" },
    identityUrl: "https://api.atlassian.com/me",
    identityPath: ["email"],
  };
}

// ── The catalog ─────────────────────────────────────────────────────────────

export const CONNECTORS: ConnectorDefinition[] = [
  // ── Email ─────────────────────────────────────────────────────────────────
  {
    id: "gmail",
    name: "Gmail",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    featureFlag: "FEATURE_EMAIL_INGESTION",
    oauth: google(["https://www.googleapis.com/auth/gmail.readonly"]),
    docs: "https://developers.google.com/gmail/api/auth/scopes",
  },
  {
    id: "outlook",
    name: "Outlook",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    featureFlag: "FEATURE_EMAIL_INGESTION",
    oauth: microsoft(["Mail.Read"]),
    docs: "https://learn.microsoft.com/graph/permissions-reference",
  },
  {
    id: "front",
    name: "Front",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "FRONT_OAUTH_CLIENT_ID",
    clientSecretEnv: "FRONT_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://app.frontapp.com/oauth/authorize",
      tokenUrl: "https://app.frontapp.com/oauth/token",
      scopes: [],
      clientAuth: "basic",
      pkce: false,
      identityUrl: "https://api2.frontapp.com/me",
      identityPath: ["email"],
    },
    docs: "https://dev.frontapp.com/docs/oauth",
  },

  // ── Calendar ──────────────────────────────────────────────────────────────
  {
    id: "google_calendar",
    name: "Google Calendar",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google(["https://www.googleapis.com/auth/calendar.readonly"]),
    docs: "https://developers.google.com/calendar/api/auth",
  },
  {
    id: "microsoft_calendar",
    name: "Microsoft Calendar",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    oauth: microsoft(["Calendars.Read"]),
    docs: "https://learn.microsoft.com/graph/permissions-reference",
  },
  {
    id: "calendly",
    name: "Calendly",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "CALENDLY_OAUTH_CLIENT_ID",
    clientSecretEnv: "CALENDLY_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://auth.calendly.com/oauth/authorize",
      tokenUrl: "https://auth.calendly.com/oauth/token",
      scopes: [],
      clientAuth: "basic",
      pkce: false,
      identityUrl: "https://api.calendly.com/users/me",
      identityPath: ["resource", "email"],
    },
    docs: "https://developer.calendly.com/api-docs",
  },

  // ── Meetings ──────────────────────────────────────────────────────────────
  {
    id: "zoom",
    name: "Zoom",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "ZOOM_OAUTH_CLIENT_ID",
    clientSecretEnv: "ZOOM_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      scopes: ["meeting:read", "recording:read", "user:read"],
      clientAuth: "basic",
      pkce: true,
      identityUrl: "https://api.zoom.us/v2/users/me",
      identityPath: ["email"],
    },
    docs: "https://developers.zoom.us/docs/integrations/oauth/",
  },
  {
    id: "google_meet",
    name: "Google Meet",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google(["https://www.googleapis.com/auth/meetings.space.readonly"]),
    docs: "https://developers.google.com/meet/api/guides/overview",
  },
  {
    id: "webex",
    name: "Webex",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "WEBEX_OAUTH_CLIENT_ID",
    clientSecretEnv: "WEBEX_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://webexapis.com/v1/authorize",
      tokenUrl: "https://webexapis.com/v1/access_token",
      scopes: [
        "spark:kms",
        "meeting:schedules_read",
        "meeting:recordings_read",
      ],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://webexapis.com/v1/people/me",
      identityPath: ["emails", "0"],
    },
    docs: "https://developer.webex.com/docs/integrations",
  },
  {
    id: "fathom",
    name: "Fathom",
    auth: "webhook",
    orgLevel: true,
    docs: "https://docs.fathom.video/",
  },
  {
    id: "gong",
    name: "Gong",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Gong access key and secret, pasted as accessKey:secret",
      probeUrl: "https://api.gong.io/v2/users",
      probeAuth: "basic",
    },
    docs: "https://gong.app.gong.io/settings/api/documentation",
  },
  {
    id: "loom",
    name: "Loom",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Loom workspace API key",
      probeAuth: "none",
    },
    docs: "https://dev.loom.com/docs/public-api",
  },

  // ── Messaging ─────────────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["channels:history", "channels:read", "users:read"],
      clientAuth: "body",
      pkce: false,
      identityFromToken: ["team", "name"],
      revokeUrl: "https://slack.com/api/auth.revoke",
    },
    docs: "https://api.slack.com/authentication/oauth-v2",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    oauth: microsoft(["ChannelMessage.Read.All", "Team.ReadBasic.All"]),
    docs: "https://learn.microsoft.com/graph/permissions-reference",
  },
  {
    id: "google_chat",
    name: "Google Chat",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google([
      "https://www.googleapis.com/auth/chat.spaces.readonly",
      "https://www.googleapis.com/auth/chat.messages.readonly",
    ]),
    docs: "https://developers.google.com/chat/api/guides/auth",
  },
  {
    id: "discord",
    name: "Discord",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "DISCORD_OAUTH_CLIENT_ID",
    clientSecretEnv: "DISCORD_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      scopes: ["identify", "guilds", "messages.read"],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://discord.com/api/users/@me",
      identityPath: ["email"],
      revokeUrl: "https://discord.com/api/oauth2/token/revoke",
    },
    docs: "https://discord.com/developers/docs/topics/oauth2",
  },
  {
    id: "telegram",
    name: "Telegram",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Bot token from @BotFather",
      probeUrl: "https://api.telegram.org/bot{credential}/getMe",
      probeAuth: "url",
      identityPath: ["result", "username"],
    },
    docs: "https://core.telegram.org/bots/api",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Cloud API system-user access token",
      probeUrl: "https://graph.facebook.com/v21.0/me",
      probeAuth: "bearer",
      identityPath: ["name"],
    },
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    id: "twilio",
    name: "Twilio",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Account SID and auth token, pasted as SID:token",
      probeUrl: "https://api.twilio.com/2010-04-01/Accounts.json",
      probeAuth: "basic",
    },
    docs: "https://www.twilio.com/docs/usage/api",
  },

  // ── Project tracking ──────────────────────────────────────────────────────
  {
    id: "jira",
    name: "Jira",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "ATLASSIAN_OAUTH_CLIENT_ID",
    clientSecretEnv: "ATLASSIAN_OAUTH_CLIENT_SECRET",
    oauth: atlassian(["read:jira-work", "read:jira-user"]),
    docs: "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/",
  },
  {
    id: "asana",
    name: "Asana",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "ASANA_OAUTH_CLIENT_ID",
    clientSecretEnv: "ASANA_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://app.asana.com/-/oauth_authorize",
      tokenUrl: "https://app.asana.com/-/oauth_token",
      scopes: ["openid", "email", "tasks:read", "projects:read", "users:read"],
      clientAuth: "body",
      pkce: true,
      identityUrl: "https://app.asana.com/api/1.0/users/me",
      identityPath: ["data", "email"],
    },
    docs: "https://developers.asana.com/docs/oauth",
  },
  {
    id: "linear",
    name: "Linear",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "LINEAR_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINEAR_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://linear.app/oauth/authorize",
      tokenUrl: "https://api.linear.app/oauth/token",
      scopes: ["read"],
      clientAuth: "body",
      pkce: false,
      revokeUrl: "https://api.linear.app/oauth/revoke",
    },
    docs: "https://developers.linear.app/docs/oauth/authentication",
  },
  {
    id: "monday",
    name: "monday.com",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "MONDAY_OAUTH_CLIENT_ID",
    clientSecretEnv: "MONDAY_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://auth.monday.com/oauth2/authorize",
      tokenUrl: "https://auth.monday.com/oauth2/token",
      scopes: ["boards:read", "users:read"],
      clientAuth: "body",
      pkce: false,
    },
    docs: "https://developer.monday.com/apps/docs/oauth",
  },
  {
    id: "clickup",
    name: "ClickUp",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "CLICKUP_OAUTH_CLIENT_ID",
    clientSecretEnv: "CLICKUP_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://app.clickup.com/api",
      tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
      scopes: [],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://api.clickup.com/api/v2/user",
      identityPath: ["user", "email"],
    },
    docs: "https://developer.clickup.com/docs/authentication",
  },
  {
    id: "trello",
    name: "Trello",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Trello API key and read token, pasted as key:token",
      probeAuth: "none",
    },
    docs: "https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/",
  },
  {
    id: "basecamp",
    name: "Basecamp",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "BASECAMP_OAUTH_CLIENT_ID",
    clientSecretEnv: "BASECAMP_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://launchpad.37signals.com/authorization/new",
      tokenUrl: "https://launchpad.37signals.com/authorization/token",
      scopes: [],
      clientAuth: "body",
      pkce: false,
      authorizeParams: { type: "web_server" },
      identityUrl: "https://launchpad.37signals.com/authorization.json",
      identityPath: ["identity", "email_address"],
    },
    docs: "https://github.com/basecamp/api/blob/master/sections/authentication.md",
  },
  {
    id: "todoist",
    name: "Todoist",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "TODOIST_OAUTH_CLIENT_ID",
    clientSecretEnv: "TODOIST_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://todoist.com/oauth/authorize",
      tokenUrl: "https://todoist.com/oauth/access_token",
      scopes: ["data:read"],
      clientAuth: "body",
      pkce: false,
    },
    docs: "https://developer.todoist.com/guides/#authorization",
  },
  {
    id: "shortcut",
    name: "Shortcut",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Shortcut API token",
      probeUrl: "https://api.app.shortcut.com/api/v3/member",
      probeAuth: "header",
      probeHeader: "Shortcut-Token",
      identityPath: ["mention_name"],
    },
    docs: "https://developer.shortcut.com/api/rest/v3",
  },

  // ── Docs & knowledge ──────────────────────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "NOTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      clientAuth: "basic",
      pkce: false,
      authorizeParams: { owner: "user" },
      identityFromToken: ["workspace_name"],
    },
    docs: "https://developers.notion.com/docs/authorization",
  },
  {
    id: "confluence",
    name: "Confluence",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "ATLASSIAN_OAUTH_CLIENT_ID",
    clientSecretEnv: "ATLASSIAN_OAUTH_CLIENT_SECRET",
    oauth: atlassian([
      "read:confluence-content.summary",
      "read:confluence-space.summary",
    ]),
    docs: "https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/",
  },
  {
    id: "google_docs",
    name: "Google Docs",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google(["https://www.googleapis.com/auth/documents.readonly"]),
    docs: "https://developers.google.com/docs/api/how-tos/authorizing",
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google(["https://www.googleapis.com/auth/spreadsheets.readonly"]),
    docs: "https://developers.google.com/sheets/api/scopes",
  },
  {
    id: "coda",
    name: "Coda",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Coda API token",
      probeUrl: "https://coda.io/apis/v1/whoami",
      probeAuth: "bearer",
      identityPath: ["loginId"],
    },
    docs: "https://coda.io/developers/apis/v1",
  },
  {
    id: "airtable",
    name: "Airtable",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "AIRTABLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "AIRTABLE_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://airtable.com/oauth2/v1/authorize",
      tokenUrl: "https://airtable.com/oauth2/v1/token",
      scopes: ["data.records:read", "schema.bases:read", "user.email:read"],
      clientAuth: "basic",
      pkce: true,
      identityUrl: "https://api.airtable.com/v0/meta/whoami",
      identityPath: ["email"],
    },
    docs: "https://airtable.com/developers/web/guides/oauth-integrations",
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  {
    id: "google_drive",
    name: "Google Drive",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    // Metadata only — file content never leaves Drive (09_CONNECTORS §9.2).
    oauth: google(["https://www.googleapis.com/auth/drive.metadata.readonly"]),
    docs: "https://developers.google.com/drive/api/guides/api-specific-auth",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    oauth: microsoft(["Files.Read.All"]),
    docs: "https://learn.microsoft.com/graph/permissions-reference",
  },
  {
    id: "sharepoint",
    name: "SharePoint",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    oauth: microsoft(["Sites.Read.All"]),
    docs: "https://learn.microsoft.com/graph/permissions-reference",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "DROPBOX_OAUTH_CLIENT_ID",
    clientSecretEnv: "DROPBOX_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes: ["files.metadata.read", "account_info.read"],
      clientAuth: "basic",
      pkce: true,
      authorizeParams: { token_access_type: "offline" },
      revokeUrl: "https://api.dropboxapi.com/2/auth/token/revoke",
    },
    docs: "https://developers.dropbox.com/oauth-guide",
  },
  {
    id: "box",
    name: "Box",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "BOX_OAUTH_CLIENT_ID",
    clientSecretEnv: "BOX_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      scopes: ["root_readonly"],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://api.box.com/2.0/users/me",
      identityPath: ["login"],
      revokeUrl: "https://api.box.com/oauth2/revoke",
    },
    docs: "https://developer.box.com/guides/authentication/oauth2/",
  },

  // ── CRM & sales ───────────────────────────────────────────────────────────
  {
    id: "hubspot",
    name: "HubSpot",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes: [
        "oauth",
        "crm.objects.deals.read",
        "crm.objects.contacts.read",
        "crm.objects.companies.read",
      ],
      clientAuth: "body",
      pkce: false,
    },
    docs: "https://developers.hubspot.com/docs/api/oauth-quickstart-guide",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "SALESFORCE_OAUTH_CLIENT_ID",
    clientSecretEnv: "SALESFORCE_OAUTH_CLIENT_SECRET",
    instanceEnv: "SALESFORCE_LOGIN_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/services/oauth2/authorize",
      tokenUrl: "https://{instance}/services/oauth2/token",
      scopes: ["api", "refresh_token", "openid", "email"],
      clientAuth: "body",
      pkce: true,
      identityUrl: "https://{instance}/services/oauth2/userinfo",
      identityPath: ["email"],
      revokeUrl: "https://{instance}/services/oauth2/revoke",
    },
    docs: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm",
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "PIPEDRIVE_OAUTH_CLIENT_ID",
    clientSecretEnv: "PIPEDRIVE_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://oauth.pipedrive.com/oauth/authorize",
      tokenUrl: "https://oauth.pipedrive.com/oauth/token",
      scopes: [],
      clientAuth: "basic",
      pkce: false,
      identityUrl: "https://api.pipedrive.com/v1/users/me",
      identityPath: ["data", "email"],
    },
    docs: "https://pipedrive.readme.io/docs/marketplace-oauth-authorization",
  },
  {
    id: "zoho_crm",
    name: "Zoho CRM",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "ZOHO_OAUTH_CLIENT_ID",
    clientSecretEnv: "ZOHO_OAUTH_CLIENT_SECRET",
    instanceEnv: "ZOHO_ACCOUNTS_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/oauth/v2/auth",
      tokenUrl: "https://{instance}/oauth/v2/token",
      scopes: ["ZohoCRM.modules.READ", "ZohoCRM.users.READ"],
      clientAuth: "body",
      pkce: false,
      authorizeParams: { access_type: "offline", prompt: "consent" },
    },
    docs: "https://www.zoho.com/crm/developer/docs/api/v6/oauth-overview.html",
  },
  {
    id: "docusign",
    name: "DocuSign",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "DOCUSIGN_OAUTH_CLIENT_ID",
    clientSecretEnv: "DOCUSIGN_OAUTH_CLIENT_SECRET",
    instanceEnv: "DOCUSIGN_AUTH_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/oauth/auth",
      tokenUrl: "https://{instance}/oauth/token",
      scopes: ["signature", "extended"],
      clientAuth: "basic",
      pkce: false,
      identityUrl: "https://{instance}/oauth/userinfo",
      identityPath: ["email"],
    },
    docs: "https://developers.docusign.com/platform/auth/authcode/",
  },

  // ── Support ───────────────────────────────────────────────────────────────
  {
    id: "zendesk",
    name: "Zendesk",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "ZENDESK_OAUTH_CLIENT_ID",
    clientSecretEnv: "ZENDESK_OAUTH_CLIENT_SECRET",
    instanceEnv: "ZENDESK_SUBDOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}.zendesk.com/oauth/authorizations/new",
      tokenUrl: "https://{instance}.zendesk.com/oauth/tokens",
      scopes: ["read"],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://{instance}.zendesk.com/api/v2/users/me",
      identityPath: ["user", "email"],
    },
    docs: "https://developer.zendesk.com/documentation/ticketing/working-with-oauth/",
  },
  {
    id: "intercom",
    name: "Intercom",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "INTERCOM_OAUTH_CLIENT_ID",
    clientSecretEnv: "INTERCOM_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://app.intercom.com/oauth",
      tokenUrl: "https://api.intercom.io/auth/eagle/token",
      scopes: [],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://api.intercom.io/me",
      identityPath: ["email"],
    },
    docs: "https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/",
  },
  {
    id: "helpscout",
    name: "Help Scout",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "HELPSCOUT_OAUTH_CLIENT_ID",
    clientSecretEnv: "HELPSCOUT_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl:
        "https://secure.helpscout.net/authentication/authorizeClientApplication",
      tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
      scopes: [],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://api.helpscout.net/v2/users/me",
      identityPath: ["email"],
    },
    docs: "https://developer.helpscout.com/mailbox-api/overview/authentication/",
  },

  // ── Engineering ───────────────────────────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["read:org", "read:user", "repo:status"],
      clientAuth: "body",
      pkce: false,
      jsonAccept: true,
      identityUrl: "https://api.github.com/user",
      identityPath: ["login"],
    },
    docs: "https://docs.github.com/apps/oauth-apps/building-oauth-apps",
  },
  {
    id: "gitlab",
    name: "GitLab",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "GITLAB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITLAB_OAUTH_CLIENT_SECRET",
    instanceEnv: "GITLAB_BASE_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/oauth/authorize",
      tokenUrl: "https://{instance}/oauth/token",
      scopes: ["read_api", "read_user"],
      clientAuth: "body",
      pkce: true,
      identityUrl: "https://{instance}/api/v4/user",
      identityPath: ["email"],
      revokeUrl: "https://{instance}/oauth/revoke",
    },
    docs: "https://docs.gitlab.com/ee/api/oauth2.html",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "BITBUCKET_OAUTH_CLIENT_ID",
    clientSecretEnv: "BITBUCKET_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://bitbucket.org/site/oauth2/authorize",
      tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
      scopes: [],
      clientAuth: "basic",
      pkce: false,
      identityUrl: "https://api.bitbucket.org/2.0/user",
      identityPath: ["username"],
    },
    docs: "https://developer.atlassian.com/cloud/bitbucket/oauth-2/",
  },
  {
    id: "sentry",
    name: "Sentry",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Sentry auth token with org:read, project:read, event:read",
      probeUrl: "https://sentry.io/api/0/organizations/",
      probeAuth: "bearer",
    },
    docs: "https://docs.sentry.io/api/auth/",
  },
  {
    id: "pagerduty",
    name: "PagerDuty",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "PAGERDUTY_OAUTH_CLIENT_ID",
    clientSecretEnv: "PAGERDUTY_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://identity.pagerduty.com/oauth/authorize",
      tokenUrl: "https://identity.pagerduty.com/oauth/token",
      scopes: ["incidents.read", "users.read"],
      clientAuth: "body",
      pkce: true,
      identityUrl: "https://api.pagerduty.com/users/me",
      identityPath: ["user", "email"],
    },
    docs: "https://developer.pagerduty.com/docs/app-oauth-token",
  },
  {
    id: "datadog",
    name: "Datadog",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Datadog API key",
      probeUrl: "https://api.datadoghq.com/api/v1/validate",
      probeAuth: "header",
      probeHeader: "DD-API-KEY",
    },
    docs: "https://docs.datadoghq.com/account_management/api-app-keys/",
  },

  // ── Design ────────────────────────────────────────────────────────────────
  {
    id: "figma",
    name: "Figma",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "FIGMA_OAUTH_CLIENT_ID",
    clientSecretEnv: "FIGMA_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://www.figma.com/oauth",
      tokenUrl: "https://api.figma.com/v1/oauth/token",
      scopes: ["files:read"],
      clientAuth: "basic",
      pkce: false,
      identityUrl: "https://api.figma.com/v1/me",
      identityPath: ["email"],
    },
    docs: "https://www.figma.com/developers/api#oauth2",
  },
  {
    id: "miro",
    name: "Miro",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "MIRO_OAUTH_CLIENT_ID",
    clientSecretEnv: "MIRO_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://miro.com/oauth/authorize",
      tokenUrl: "https://api.miro.com/v1/oauth/token",
      scopes: ["boards:read"],
      clientAuth: "body",
      pkce: false,
    },
    docs: "https://developers.miro.com/docs/getting-started-with-oauth",
  },

  // ── People ────────────────────────────────────────────────────────────────
  {
    id: "greenhouse",
    name: "Greenhouse",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Harvest API key",
      probeUrl: "https://harvest.greenhouse.io/v1/users",
      probeAuth: "basic",
    },
    docs: "https://developers.greenhouse.io/harvest.html",
  },
  {
    id: "gusto",
    name: "Gusto",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "GUSTO_OAUTH_CLIENT_ID",
    clientSecretEnv: "GUSTO_OAUTH_CLIENT_SECRET",
    instanceEnv: "GUSTO_API_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/oauth/authorize",
      tokenUrl: "https://{instance}/oauth/token",
      scopes: [],
      clientAuth: "body",
      pkce: false,
    },
    docs: "https://docs.gusto.com/app-integrations/docs/authentication",
  },
  {
    id: "personio",
    name: "Personio",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Personio client id and secret, pasted as clientId:secret",
      probeAuth: "none",
    },
    docs: "https://developer.personio.de/docs/getting-started-with-the-personio-api",
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    id: "stripe",
    name: "Stripe",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Restricted key with read-only invoice and subscription access",
      probeUrl: "https://api.stripe.com/v1/account",
      probeAuth: "bearer",
      identityPath: ["email"],
    },
    docs: "https://docs.stripe.com/keys#limit-access",
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "QUICKBOOKS_OAUTH_CLIENT_ID",
    clientSecretEnv: "QUICKBOOKS_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      scopes: ["com.intuit.quickbooks.accounting", "openid", "email"],
      clientAuth: "basic",
      pkce: false,
      identityUrl:
        "https://accounts.platform.intuit.com/v1/openid_connect/userinfo",
      identityPath: ["email"],
    },
    docs: "https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization",
  },
  {
    id: "xero",
    name: "Xero",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "XERO_OAUTH_CLIENT_ID",
    clientSecretEnv: "XERO_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://login.xero.com/identity/connect/authorize",
      tokenUrl: "https://identity.xero.com/connect/token",
      scopes: [
        "openid",
        "email",
        "offline_access",
        "accounting.transactions.read",
      ],
      clientAuth: "basic",
      pkce: false,
    },
    docs: "https://developer.xero.com/documentation/guides/oauth2/auth-flow/",
  },
  {
    id: "shopify",
    name: "Shopify",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "SHOPIFY_OAUTH_CLIENT_ID",
    clientSecretEnv: "SHOPIFY_OAUTH_CLIENT_SECRET",
    instanceEnv: "SHOPIFY_SHOP_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/admin/oauth/authorize",
      tokenUrl: "https://{instance}/admin/oauth/access_token",
      scopes: ["read_orders", "read_products"],
      clientAuth: "body",
      pkce: false,
    },
    docs: "https://shopify.dev/docs/apps/auth/oauth",
  },

  // ── Marketing & forms ─────────────────────────────────────────────────────
  {
    id: "mailchimp",
    name: "Mailchimp",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "MAILCHIMP_OAUTH_CLIENT_ID",
    clientSecretEnv: "MAILCHIMP_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://login.mailchimp.com/oauth2/authorize",
      tokenUrl: "https://login.mailchimp.com/oauth2/token",
      scopes: [],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://login.mailchimp.com/oauth2/metadata",
      identityPath: ["login", "email"],
    },
    docs: "https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/",
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Read-only API key",
      probeUrl: "https://api.sendgrid.com/v3/user/account",
      probeAuth: "bearer",
    },
    docs: "https://www.twilio.com/docs/sendgrid/api-reference",
  },
  {
    id: "typeform",
    name: "Typeform",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "TYPEFORM_OAUTH_CLIENT_ID",
    clientSecretEnv: "TYPEFORM_OAUTH_CLIENT_SECRET",
    oauth: {
      authorizeUrl: "https://api.typeform.com/oauth/authorize",
      tokenUrl: "https://api.typeform.com/oauth/token",
      scopes: ["forms:read", "responses:read", "accounts:read"],
      clientAuth: "body",
      pkce: false,
      identityUrl: "https://api.typeform.com/me",
      identityPath: ["email"],
    },
    docs: "https://www.typeform.com/developers/get-started/scopes/",
  },
  {
    id: "google_forms",
    name: "Google Forms",
    auth: "oauth2",
    orgLevel: false,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google([
      "https://www.googleapis.com/auth/forms.responses.readonly",
    ]),
    docs: "https://developers.google.com/forms/api/guides/authorize",
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  {
    id: "google_analytics",
    name: "Google Analytics",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    oauth: google(["https://www.googleapis.com/auth/analytics.readonly"]),
    docs: "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries",
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Service account, pasted as username:secret",
      probeAuth: "none",
    },
    docs: "https://developer.mixpanel.com/reference/service-accounts",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "API key and secret key, pasted as key:secret",
      probeAuth: "none",
    },
    docs: "https://www.docs.developers.amplitude.com/analytics/apis/dashboard-rest-api/",
  },
  {
    id: "segment",
    name: "Segment",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "Public API token",
      probeUrl: "https://api.segmentapis.com/whoami",
      probeAuth: "bearer",
      identityPath: ["data", "name"],
    },
    docs: "https://docs.segmentapis.com/tag/Getting-Started",
  },

  // ── Identity ──────────────────────────────────────────────────────────────
  {
    id: "okta",
    name: "Okta",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "OKTA_OAUTH_CLIENT_ID",
    clientSecretEnv: "OKTA_OAUTH_CLIENT_SECRET",
    instanceEnv: "OKTA_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/oauth2/v1/authorize",
      tokenUrl: "https://{instance}/oauth2/v1/token",
      scopes: ["openid", "email", "okta.users.read", "okta.groups.read"],
      clientAuth: "basic",
      pkce: true,
      identityUrl: "https://{instance}/oauth2/v1/userinfo",
      identityPath: ["email"],
      revokeUrl: "https://{instance}/oauth2/v1/revoke",
    },
    docs: "https://developer.okta.com/docs/guides/implement-oauth-for-okta/",
  },
  {
    id: "auth0",
    name: "Auth0",
    auth: "oauth2",
    orgLevel: true,
    clientIdEnv: "AUTH0_OAUTH_CLIENT_ID",
    clientSecretEnv: "AUTH0_OAUTH_CLIENT_SECRET",
    instanceEnv: "AUTH0_DOMAIN",
    oauth: {
      authorizeUrl: "https://{instance}/authorize",
      tokenUrl: "https://{instance}/oauth/token",
      scopes: ["openid", "email", "read:users", "read:roles", "offline_access"],
      clientAuth: "body",
      pkce: true,
      authorizeParams: { audience: "https://{instance}/api/v2/" },
      identityUrl: "https://{instance}/userinfo",
      identityPath: ["email"],
    },
    docs: "https://auth0.com/docs/get-started/authentication-and-authorization-flow",
  },
  {
    id: "workos",
    name: "WorkOS",
    auth: "api_key",
    orgLevel: true,
    apiKey: {
      hint: "WorkOS API key (sk_...)",
      probeUrl: "https://api.workos.com/organizations?limit=1",
      probeAuth: "bearer",
    },
    docs: "https://workos.com/docs/sso/quick-start",
  },

  // ── Automation ────────────────────────────────────────────────────────────
  {
    id: "zapier",
    name: "Zapier",
    auth: "webhook",
    orgLevel: true,
    docs: "https://platform.zapier.com/build/webhook-trigger",
  },
  {
    id: "make",
    name: "Make",
    auth: "webhook",
    orgLevel: true,
    docs: "https://www.make.com/en/help/tools/webhooks",
  },
  {
    id: "n8n",
    name: "n8n",
    auth: "webhook",
    orgLevel: true,
    docs: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/",
  },
];

export const CONNECTOR_IDS: string[] = CONNECTORS.map((c) => c.id);

const BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));

export function connector(id: string): ConnectorDefinition | undefined {
  return BY_ID.get(id);
}

export function isKnownProvider(id: string): boolean {
  return BY_ID.has(id);
}

/** Substitutes {instance} and {tenant} in a registry URL. */
export function resolveUrl(url: string, def: ConnectorDefinition): string {
  let out = url;
  if (out.includes("{instance}")) {
    const value = def.instanceEnv ? process.env[def.instanceEnv]?.trim() : "";
    if (!value) throw new Error(`instance_not_configured:${def.instanceEnv}`);
    out = out.replaceAll("{instance}", value);
  }
  if (out.includes("{tenant}")) {
    out = out.replaceAll(
      "{tenant}",
      process.env.MICROSOFT_TENANT_ID?.trim() || "common",
    );
  }
  return out;
}

export interface ConnectorAvailability {
  configured: boolean;
  missing: string[];
}

/**
 * Can this connector be offered right now? OAuth needs client credentials;
 * api_key and webhook connectors only need the encryption key, which is checked
 * by the route. Feature-flagged connectors stay unavailable until the flag flips.
 */
export function connectorAvailability(
  def: ConnectorDefinition,
): ConnectorAvailability {
  const missing: string[] = [];
  if (def.featureFlag && process.env[def.featureFlag] !== "true") {
    missing.push(`${def.featureFlag}=true`);
  }
  if (def.auth === "oauth2") {
    for (const name of [def.clientIdEnv, def.clientSecretEnv]) {
      if (name && !process.env[name]?.trim()) missing.push(name);
    }
    if (def.instanceEnv && !process.env[def.instanceEnv]?.trim()) {
      missing.push(def.instanceEnv);
    }
  }
  return { configured: missing.length === 0, missing };
}

/** Public, token-free view of a connector for GET /connections/catalog. */
export function serializeConnector(def: ConnectorDefinition) {
  const availability = connectorAvailability(def);
  return {
    id: def.id,
    name: def.name,
    auth: def.auth,
    orgLevel: def.orgLevel,
    scopes: def.oauth?.scopes ?? [],
    credentialHint: def.apiKey?.hint ?? null,
    configured: availability.configured,
    missing: availability.missing,
    gated: Boolean(def.featureFlag),
    docs: def.docs,
  };
}
