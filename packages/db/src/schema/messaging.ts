import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import { commitments } from "./work.js";

/** Messaging — 02_DATA_MODEL §2.5 */

/** Global Meta template registry (no tenant_id). */
export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateKey: text("template_key").notNull().unique(),
  metaTemplateName: text("meta_template_name").notNull(),
  category: text("category")
    .$type<"utility" | "authentication" | "marketing">()
    .notNull(),
  language: text("language").notNull().default("en"),
  body: text("body").notNull(),
  variableMap: jsonb("variable_map").$type<Record<string, string>>().notNull(),
  metaStatus: text("meta_status")
    .$type<"pending" | "approved" | "rejected" | "paused" | "disabled">()
    .notNull()
    .default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  channel: text("channel").notNull().default("whatsapp"),
  serviceWindowExpiresAt: timestamp("service_window_expires_at", { withTimezone: true }),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
  state: text("state")
    .$type<"idle" | "awaiting_reply" | "awaiting_clarification" | "in_survey">()
    .notNull()
    .default("idle"),
  stateContext: jsonb("state_context").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  commitmentId: uuid("commitment_id").references(() => commitments.id, {
    onDelete: "set null",
  }),
  surveyInstanceId: uuid("survey_instance_id"),
  direction: text("direction").$type<"inbound" | "outbound">().notNull(),
  channel: text("channel").notNull().default("whatsapp"),
  templateKey: text("template_key"),
  body: text("body").notNull(),
  intent: text("intent"),
  providerMessageId: text("provider_message_id"),
  deliveryStatus: text("delivery_status").$type<
    "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered"
  >(),
  failureReason: text("failure_reason"),
  parsedStatus: text("parsed_status").$type<
    "on_track" | "in_progress" | "blocked" | "done" | "not_started" | "unclear" | "opt_out"
  >(),
  parsedProgressPct: numeric("parsed_progress_pct", { precision: 5, scale: 2 }),
  parsedBlocker: text("parsed_blocker"),
  parsedNeeds: text("parsed_needs"),
  parsedConfidence: numeric("parsed_confidence", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A3 — pilot approval queue. Replaces the browser-storage queue. */
export const messageApprovals = pgTable("message_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  recipientUserId: uuid("recipient_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  templateKey: text("template_key").notNull(),
  preview: text("preview").notNull(),
  status: text("status")
    .$type<"pending" | "approved" | "rejected" | "sent">()
    .notNull()
    .default("pending"),
  requestedByUserId: uuid("requested_by_user_id"),
  decidedByUserId: uuid("decided_by_user_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messagingQuota = pgTable(
  "messaging_quota",
  {
    tenantId: uuid("tenant_id").notNull(),
    windowDate: date("window_date").notNull(),
    uniqueContacts: integer("unique_contacts").notNull().default(0),
    messagesSent: integer("messages_sent").notNull().default(0),
    messagesFailed: integer("messages_failed").notNull().default(0),
    optOuts: integer("opt_outs").notNull().default(0),
    blocks: integer("blocks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.windowDate] })],
);
