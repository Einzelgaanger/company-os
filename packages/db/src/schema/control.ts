import {
  boolean,
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

/** Control plane — 02_DATA_MODEL §2.1 */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug"),
  // CHECK isolation_tier IN ('pooled','silo')
  isolationTier: text("isolation_tier").$type<"pooled" | "silo">().notNull().default("pooled"),
  region: text("region"),
  dbConnectionRef: text("db_connection_ref"),
  // CHECK plan IN ('pilot','starter','growth','enterprise')
  plan: text("plan").$type<"pilot" | "starter" | "growth" | "enterprise">().notNull().default("pilot"),
  seatLimit: integer("seat_limit"),
  // CHECK status IN ('provisioning','active','suspended','offboarding')
  status: text("status")
    .$type<"provisioning" | "active" | "suspended" | "offboarding">()
    .notNull()
    .default("provisioning"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantCompliance = pgTable("tenant_compliance", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lawfulBasis: text("lawful_basis")
    .$type<"legitimate_interest" | "contract" | "legal_obligation">()
    .notNull()
    .default("legitimate_interest"),
  dpiaCompleted: boolean("dpia_completed").notNull().default(false),
  dpiaCompletedAt: timestamp("dpia_completed_at", { withTimezone: true }),
  dpiaDocumentUrl: text("dpia_document_url"),
  liaCompleted: boolean("lia_completed").notNull().default(false),
  worksCouncilRequired: boolean("works_council_required").notNull().default(false),
  worksCouncilConsulted: boolean("works_council_consulted").notNull().default(false),
  employeeNoticePublished: boolean("employee_notice_published").notNull().default(false),
  employeeNoticeVersion: text("employee_notice_version"),
  dpoName: text("dpo_name"),
  dpoEmail: text("dpo_email"),
  dataResidencyRegion: text("data_residency_region"),
  /** C-1: not settable via UI */
  highRiskUseProhibited: boolean("high_risk_use_prohibited").notNull().default(true),
  attestedByUserId: uuid("attested_by_user_id"),
  attestedAt: timestamp("attested_at", { withTimezone: true }),
});

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Africa/Nairobi"),
  workDays: integer("work_days").array().notNull().default([1, 2, 3, 4, 5]),
  quietHoursStart: text("quiet_hours_start").notNull().default("18:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("08:00"),
  defaultEscalationSlaHours: integer("default_escalation_sla_hours").notNull().default(24),
  checkinLeadDays: integer("checkin_lead_days").notNull().default(2),
  maxCheckinsPerPersonPerDay: integer("max_checkins_per_person_per_day").notNull().default(3),
  reportFrequency: text("report_frequency")
    .$type<"weekly" | "daily_and_weekly">()
    .notNull()
    .default("weekly"),
  reportDayOfWeek: integer("report_day_of_week").notNull().default(1),
  reportSendHour: integer("report_send_hour").notNull().default(8),
  surveyEnabled: boolean("survey_enabled").notNull().default(true),
  surveyFrequency: text("survey_frequency")
    .$type<"weekly" | "biweekly" | "monthly" | "off">()
    .notNull()
    .default("weekly"),
  retentionMonthsMessages: integer("retention_months_messages").notNull().default(12),
  retentionMonthsTranscripts: integer("retention_months_transcripts").notNull().default(12),
  retentionMonthsAudit: integer("retention_months_audit").notNull().default(24),
  /**
   * B4 — 03_COORDINATION_MODES §3.5. Read through `coordinationProfile()` in
   * @loop/shared; nothing branches on this string directly.
   */
  coordinationMode: text("coordination_mode")
    .$type<
      | "mutual_adjustment"
      | "direct_supervision"
      | "standardized_process"
      | "standardized_outputs"
      | "standardized_skills"
    >()
    .notNull()
    .default("mutual_adjustment"),
  /** §3.6 — kept so the onboarding inference can be scored later. */
  coordinationModeSource: text("coordination_mode_source")
    .$type<"default" | "inferred" | "chosen">()
    .notNull()
    .default("default"),
  coordinationModeSetAt: timestamp("coordination_mode_set_at", { withTimezone: true }),
  coordinationModeSetByUserId: uuid("coordination_mode_set_by_user_id"),
});

/**
 * Public holidays — 04_FLOW_ENGINE §4.4. Editable at /settings/organization,
 * never inferred. Feeds workingSecondsBetween via TenantTimeSettings.holidays.
 */
export const tenantHolidays = pgTable(
  "tenant_holidays",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    holidayDate: date("holiday_date").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.holidayDate] })],
);

export const tenantFlags = pgTable(
  "tenant_flags",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    flag: text("flag").notNull(),
    enabled: boolean("enabled").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.flag] })],
);
