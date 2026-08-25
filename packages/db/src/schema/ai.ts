import {
  boolean,
  bigserial,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/** AI ops + audit — 02_DATA_MODEL §2.9 */

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  task: text("task").notNull(),
  model: text("model").notNull(),
  tier: text("tier").$type<"fast" | "standard" | "deep">().notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cachedTokens: integer("cached_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  latencyMs: integer("latency_ms"),
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  outputValid: boolean("output_valid"),
  validationErrors: jsonb("validation_errors"),
  escalatedToTier: text("escalated_to_tier"),
  sampledForQa: boolean("sampled_for_qa").notNull().default(false),
  qaAgreement: boolean("qa_agreement"),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const injectionEvents = pgTable("injection_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id"),
  detection: text("detection").notNull(),
  rawExcerptRef: text("raw_excerpt_ref"),
  actionTaken: text("action_taken").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  actorType: text("actor_type")
    .$type<"user" | "system" | "scim" | "admin_support">()
    .notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dsrRequests = pgTable("dsr_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  requestType: text("request_type")
    .$type<"access" | "erasure" | "rectification" | "objection">()
    .notNull(),
  status: text("status")
    .$type<"received" | "in_progress" | "completed" | "rejected">()
    .notNull()
    .default("received"),
  exportRef: text("export_ref"),
  handledByUserId: uuid("handled_by_user_id").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
