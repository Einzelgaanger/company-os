import {
  boolean,
  inet,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./control.js";

/** Identity — 02_DATA_MODEL §2.2 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  externalId: text("external_id"),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  displayName: text("display_name"),
  jobTitle: text("job_title"),
  department: text("department"),
  phoneE164: text("phone_e164"),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  whatsappOptInAt: timestamp("whatsapp_opt_in_at", { withTimezone: true }),
  whatsappOptOutAt: timestamp("whatsapp_opt_out_at", { withTimezone: true }),
  // CHECK role IN ('member','manager','admin','owner')
  role: text("role")
    .$type<"member" | "manager" | "admin" | "owner">()
    .notNull()
    .default("member"),
  managerId: uuid("manager_id"),
  // CHECK status IN ('invited','active','suspended','deprovisioned')
  status: text("status")
    .$type<"invited" | "active" | "suspended" | "deprovisioned">()
    .notNull()
    .default("invited"),
  noticeAcknowledgedAt: timestamp("notice_acknowledged_at", { withTimezone: true }),
  noticeVersion: text("notice_version"),
  locale: text("locale").notNull().default("en"),
  avatarUrl: text("avatar_url"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  externalId: text("external_id"),
  leadUserId: uuid("lead_user_id"),
  parentTeamId: uuid("parent_team_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    tenantId: uuid("tenant_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.teamId, t.userId] })],
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  email: text("email").notNull(),
  // CHECK role IN ('member','manager','admin') — never owner via invite
  role: text("role").$type<"member" | "manager" | "admin">().notNull(),
  teamId: uuid("team_id"),
  managerId: uuid("manager_id"),
  tokenHash: text("token_hash").notNull(),
  invitedByUserId: uuid("invited_by_user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const identityConnections = pgTable("identity_connections", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ssoEnabled: boolean("sso_enabled").notNull().default(false),
  ssoConnectionId: text("sso_connection_id"),
  ssoDomains: text("sso_domains").array(),
  scimEnabled: boolean("scim_enabled").notNull().default(false),
  scimDirectoryId: text("scim_directory_id"),
  scimLastSyncAt: timestamp("scim_last_sync_at", { withTimezone: true }),
  scimGroupRoleMap: jsonb("scim_group_role_map").$type<Record<string, string>>().notNull().default({}),
  jitProvisioning: boolean("jit_provisioning").notNull().default(true),
  defaultRoleOnJit: text("default_role_on_jit").notNull().default("member"),
});
