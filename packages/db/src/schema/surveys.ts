import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/** Surveys — 02_DATA_MODEL §2.7. survey_responses has NO user_id FK (C-2). */

export const surveyCycles = pgTable("survey_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  theme: text("theme"),
  generationRationale: text("generation_rationale"),
  status: text("status")
    .$type<"draft" | "sending" | "collecting" | "aggregating" | "closed" | "suppressed">()
    .notNull()
    .default("draft"),
  invitedCount: integer("invited_count").notNull().default(0),
  respondedCount: integer("responded_count").notNull().default(0),
  /** C-2: >= 5 respondents */
  minNMet: boolean("min_n_met").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const surveyQuestions = pgTable("survey_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => surveyCycles.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  questionText: text("question_text").notNull(),
  questionType: text("question_type")
    .$type<"scale_1_5" | "open_text" | "yes_no" | "multi_choice">()
    .notNull(),
  options: jsonb("options"),
  topic: text("topic").notNull(),
  generatedBy: text("generated_by")
    .$type<"ai" | "admin" | "template">()
    .notNull()
    .default("ai"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const surveyResponses = pgTable("survey_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => surveyCycles.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => surveyQuestions.id, { onDelete: "cascade" }),
  /** HMAC(user_id, cycle_salt) — not reversible outside the cycle. NO user_id column. */
  respondentHash: text("respondent_hash").notNull(),
  answerScale: integer("answer_scale"),
  answerBool: boolean("answer_bool"),
  answerText: text("answer_text"),
  sentimentLabel: text("sentiment_label").$type<"positive" | "neutral" | "negative">(),
  sentimentPurgedAt: timestamp("sentiment_purged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const surveyAggregates = pgTable("survey_aggregates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => surveyCycles.id, { onDelete: "cascade" }),
  scope: text("scope").$type<"org" | "team" | "project">().notNull().default("org"),
  scopeId: uuid("scope_id"),
  /** CHECK respondent_count >= 5 (C-2) */
  respondentCount: integer("respondent_count").notNull(),
  avgScale: numeric("avg_scale", { precision: 4, scale: 2 }),
  sentimentPositivePct: numeric("sentiment_positive_pct", { precision: 5, scale: 2 }),
  sentimentNeutralPct: numeric("sentiment_neutral_pct", { precision: 5, scale: 2 }),
  sentimentNegativePct: numeric("sentiment_negative_pct", { precision: 5, scale: 2 }),
  themes: jsonb("themes").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
