import {
  bigserial,
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
/** Work domain — 02_DATA_MODEL §2.3, flow model 04_FLOW_ENGINE §4.2–§4.7 */

/** §4.2. Exactly one of these at all times; every transition is a flow_events row. */
export type FlowState =
  | "proposed"
  | "ready"
  | "active"
  | "waiting_internal"
  | "waiting_external"
  | "waiting_decision"
  | "waiting_dependency"
  | "review"
  | "done"
  | "cancelled";

/** §4.5. Set by a human, never by a model. */
export type CostOfDelayBand = "critical" | "high" | "standard" | "low";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  clientName: text("client_name"),
  ownerUserId: uuid("owner_user_id"),
  teamId: uuid("team_id"),
  // CHECK status IN ('planning','active','on_hold','completed','archived')
  status: text("status")
    .$type<"planning" | "active" | "on_hold" | "completed" | "archived">()
    .notNull()
    .default("active"),
  startDate: date("start_date"),
  targetEndDate: date("target_end_date"),
  actualEndDate: date("actual_end_date"),
  // CHECK health IN ('on_track','at_risk','off_track','unknown')
  health: text("health")
    .$type<"on_track" | "at_risk" | "off_track" | "unknown">()
    .notNull()
    .default("unknown"),
  healthComputedAt: timestamp("health_computed_at", { withTimezone: true }),
  progressPct: numeric("progress_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  progressComputedAt: timestamp("progress_computed_at", { withTimezone: true }),
  // §4.7 buffer + fever chart. buffer_days null means "not enough signal yet".
  bufferDays: numeric("buffer_days", { precision: 6, scale: 2 }),
  // CHECK buffer_method IN ('explicit','observed_waiting','classical','unknown')
  bufferMethod: text("buffer_method")
    .$type<"explicit" | "observed_waiting" | "classical" | "unknown">()
    .notNull()
    .default("unknown"),
  bufferConsumedDays: numeric("buffer_consumed_days", { precision: 6, scale: 2 })
    .notNull()
    .default("0"),
  chainCompletePct: numeric("chain_complete_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  // CHECK fever_zone IN ('green','amber','red','unknown')
  feverZone: text("fever_zone")
    .$type<"green" | "amber" | "red" | "unknown">()
    .notNull()
    .default("unknown"),
  feverComputedAt: timestamp("fever_computed_at", { withTimezone: true }),
  /** §4.5 project-level band, inherited by this project's commitments. */
  costOfDelayBand: text("cost_of_delay_band").$type<CostOfDelayBand>().notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1"),
  dueDate: date("due_date"),
  // CHECK status IN ('open','in_progress','done','cancelled')
  status: text("status")
    .$type<"open" | "in_progress" | "done" | "cancelled">()
    .notNull()
    .default("open"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const commitments = pgTable("commitments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  projectId: uuid("project_id"),
  milestoneId: uuid("milestone_id"),
  title: text("title").notNull(),
  description: text("description"),
  ownerUserId: uuid("owner_user_id"),
  ownerExternalName: text("owner_external_name"),
  ownerExternalEmail: text("owner_external_email"),
  ownerConfidence: numeric("owner_confidence", { precision: 3, scale: 2 }),
  requestedByUserId: uuid("requested_by_user_id"),
  // CHECK source_type IN ('meeting','email','manual','whatsapp','calendar','import')
  sourceType: text("source_type")
    .$type<"meeting" | "email" | "manual" | "whatsapp" | "calendar" | "import">()
    .notNull(),
  sourceId: uuid("source_id"),
  sourceExcerpt: text("source_excerpt"),
  extractionRunId: uuid("extraction_run_id"),
  /** @deprecated §4.6 — use committedDate. Dropped once no caller reads it. */
  dueDate: date("due_date"),
  /** @deprecated §4.6 — use committedDateSource. There is no 'inferred' successor. */
  dueDateSource: text("due_date_source").$type<"stated" | "inferred" | "manual" | "none">(),
  /** §4.6. Exists only when a human committed to it with another party. */
  committedDate: date("committed_date"),
  // CHECK committed_date_source IN ('committed','none'); must agree with committedDate
  committedDateSource: text("committed_date_source")
    .$type<"committed" | "none">()
    .notNull()
    .default("none"),
  // CHECK flow_state IN (…10 states…) — see FlowState
  flowState: text("flow_state").$type<FlowState>().notNull().default("proposed"),
  flowStateSince: timestamp("flow_state_since", { withTimezone: true }).notNull().defaultNow(),
  /** FK users(id). Set for waiting_internal / waiting_decision. */
  waitingOnUserId: uuid("waiting_on_user_id"),
  /** Free text: most waiting is on someone who will never be a Loop user (§4.3). */
  waitingOnExternalName: text("waiting_on_external_name"),
  /** FK commitments(id). Set for waiting_dependency. */
  waitingOnCommitmentId: uuid("waiting_on_commitment_id"),
  /** Start of queue age (§4.2). */
  firstReadyAt: timestamp("first_ready_at", { withTimezone: true }),
  costOfDelayBand: text("cost_of_delay_band").$type<CostOfDelayBand>().notNull().default("standard"),
  // CHECK cost_of_delay_band_source IN ('default','project','manual')
  costOfDelayBandSource: text("cost_of_delay_band_source")
    .$type<"default" | "project" | "manual">()
    .notNull()
    .default("default"),
  /** §4.10 corroboration divergence. Flags the item, never the person. */
  needsLook: boolean("needs_look").notNull().default(false),
  needsLookReason: text("needs_look_reason"),
  /** @deprecated §4.2 — use flowState. Dropped once no caller reads it. */
  // CHECK status IN ('open','in_progress','blocked','at_risk','overdue','escalated','done','cancelled')
  status: text("status")
    .$type<
      | "open"
      | "in_progress"
      | "blocked"
      | "at_risk"
      | "overdue"
      | "escalated"
      | "done"
      | "cancelled"
    >()
    .notNull()
    .default("open"),
  priority: text("priority")
    .$type<"low" | "medium" | "high" | "critical">()
    .notNull()
    .default("medium"),
  progressPct: numeric("progress_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  reviewRequired: boolean("review_required").notNull().default(false),
  reviewReason: text("review_reason"),
  lastCheckinAt: timestamp("last_checkin_at", { withTimezone: true }),
  lastResponseAt: timestamp("last_response_at", { withTimezone: true }),
  nextCheckinAt: timestamp("next_checkin_at", { withTimezone: true }),
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * §4.2. Every transition, append-only (a trigger blocks UPDATE).
 * Every metric derives from this table; commitments.flowState is only a cache
 * of the latest row, and both are written in one transaction.
 */
export const flowEvents = pgTable("flow_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  commitmentId: uuid("commitment_id")
    .notNull()
    .references(() => commitments.id, { onDelete: "cascade" }),
  /** Null on the first event for a commitment. */
  fromState: text("from_state").$type<FlowState>(),
  toState: text("to_state").$type<FlowState>().notNull(),
  waitingOnUserId: uuid("waiting_on_user_id"),
  waitingOnExternalName: text("waiting_on_external_name"),
  /** Wall-clock seconds in fromState; null on the first event. */
  durationSeconds: integer("duration_seconds"),
  /** durationSeconds excluding non-working hours — always via workingSecondsBetween (§4.4). */
  workingSeconds: integer("working_seconds"),
  // CHECK source IN ('checkin','manual','extraction','system','corroboration')
  source: text("source")
    .$type<"checkin" | "manual" | "extraction" | "system" | "corroboration">()
    .notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commitmentEvents = pgTable("commitment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  commitmentId: uuid("commitment_id")
    .notNull()
    .references(() => commitments.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
