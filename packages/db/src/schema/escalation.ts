import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import { commitments, projects } from "./work.js";
import { teams } from "./identity.js";

/** Escalation — 02_DATA_MODEL §2.6 */

export const ownershipMap = pgTable("ownership_map", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  category: text("category").notNull(),
  matchKeywords: text("match_keywords").array().notNull().default([]),
  projectId: uuid("project_id").references(() => projects.id),
  teamId: uuid("team_id").references(() => teams.id),
  primaryOwnerUserId: uuid("primary_owner_user_id")
    .notNull()
    .references(() => users.id),
  backupOwnerUserId: uuid("backup_owner_user_id").references(() => users.id),
  slaHours: integer("sla_hours").notNull().default(24),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const escalations = pgTable("escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  commitmentId: uuid("commitment_id")
    .notNull()
    .references(() => commitments.id, { onDelete: "cascade" }),
  escalatedToUserId: uuid("escalated_to_user_id")
    .notNull()
    .references(() => users.id),
  routedBy: text("routed_by")
    .$type<"ownership_map" | "manager_fallback" | "admin_fallback" | "manual">()
    .notNull(),
  ownershipMapId: uuid("ownership_map_id"),
  trigger: text("trigger")
    .$type<"blocker_reported" | "no_response" | "past_due" | "manual">()
    .notNull(),
  reason: text("reason").notNull(),
  contextSnapshot: jsonb("context_snapshot").$type<Record<string, unknown>>().notNull(),
  level: integer("level").notNull().default(1),
  status: text("status")
    .$type<"open" | "acknowledged" | "resolved" | "expired">()
    .notNull()
    .default("open"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  /**
   * B4 — the coordination mode in force when this route was chosen. A mode
   * change invalidates the ladder, most sharply on the way into
   * `standardized_skills`, where a supervisory route becomes illegal (§3.4).
   */
  routedUnderMode: text("routed_under_mode").$type<
    | "mutual_adjustment"
    | "direct_supervision"
    | "standardized_process"
    | "standardized_outputs"
    | "standardized_skills"
  >(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
