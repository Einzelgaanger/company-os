import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Ingestion — 02_DATA_MODEL §2.4 */

export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id"),
  // CHECK provider IN (...)
  provider: text("provider").notNull(),
  // CHECK status IN ('connected','disconnected','error','expired','revoked')
  status: text("status")
    .$type<"connected" | "disconnected" | "error" | "expired" | "revoked">()
    .notNull()
    .default("disconnected"),
  scopes: text("scopes").array().notNull().default([]),
  externalAccount: text("external_account"),
  accessTokenEnc: bytea("access_token_enc"),
  refreshTokenEnc: bytea("refresh_token_enc"),
  /** Pasted read credential for api_key connectors. Same envelope as tokens. */
  apiKeyEnc: bytea("api_key_enc"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  /** Per-customer host: Zendesk subdomain, Shopify shop, Okta org, self-hosted GitLab. */
  instance: text("instance"),
  /** Opaque per-tenant id in the inbound webhook path (09_CONNECTORS §9.3). */
  webhookId: text("webhook_id"),
  webhookSecretEnc: bytea("webhook_secret_enc"),
  /** Provider paging cursor so ingestion resumes instead of refetching. */
  syncCursor: jsonb("sync_cursor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Connector audit trail — connect, disconnect, refresh, failure. Kept separate
 * from `connections` so a revoked row still explains what happened.
 */
export const connectionEvents = pgTable("connection_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  connectionId: uuid("connection_id"),
  provider: text("provider").notNull(),
  // CHECK event IN ('authorized','connected','refreshed','refresh_failed','disconnected','revoked','sync_failed')
  event: text("event").notNull(),
  actorUserId: uuid("actor_user_id"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ingestionExclusions = pgTable("ingestion_exclusions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  ruleType: text("rule_type").notNull(),
  value: text("value").notNull(),
  scope: text("scope")
    .$type<"all" | "email" | "calendar" | "meetings" | "files" | "chat">()
    .notNull()
    .default("all"),
  reason: text("reason"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  organizerEmail: text("organizer_email"),
  participants: jsonb("participants").$type<unknown[]>().notNull().default([]),
  hasExternalParticipants: boolean("has_external_participants").notNull().default(false),
  /** C-2: text transcript only; audio never stored */
  transcriptRef: text("transcript_ref"),
  transcriptSha256: text("transcript_sha256"),
  projectId: uuid("project_id"),
  projectLinkMethod: text("project_link_method").$type<"auto" | "manual" | "none">(),
  visibilityUserIds: uuid("visibility_user_ids").array().notNull().default([]),
  status: text("status")
    .$type<"ingested" | "excluded" | "processing" | "processed" | "failed" | "needs_review">()
    .notNull()
    .default("ingested"),
  excludedByRuleId: uuid("excluded_by_rule_id"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  commitmentsExtracted: integer("commitments_extracted").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceMessages = pgTable("source_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  threadExternalId: text("thread_external_id"),
  subject: text("subject"),
  fromEmail: text("from_email"),
  toEmails: text("to_emails").array(),
  ccEmails: text("cc_emails").array(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  bodyRef: text("body_ref"),
  bodyPurgedAt: timestamp("body_purged_at", { withTimezone: true }),
  visibilityUserIds: uuid("visibility_user_ids").array().notNull().default([]),
  status: text("status")
    .$type<"ingested" | "excluded" | "processing" | "processed" | "failed">()
    .notNull()
    .default("ingested"),
  excludedByRuleId: uuid("excluded_by_rule_id"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
