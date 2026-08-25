import {
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/** Reporting — 02_DATA_MODEL §2.8 */

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  type: text("type").$type<"weekly" | "daily">().notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
  contentHtml: text("content_html"),
  pdfRef: text("pdf_ref"),
  pdfSha256: text("pdf_sha256"),
  status: text("status")
    .$type<"generating" | "ready" | "sending" | "sent" | "failed">()
    .notNull()
    .default("generating"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportRecipients = pgTable("report_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").references(() => users.id),
  email: text("email"),
  reportType: text("report_type").$type<"weekly" | "daily">().notNull(),
  scope: text("scope").$type<"org" | "team" | "project">().notNull().default("org"),
  scopeId: uuid("scope_id"),
  active: boolean("active").notNull().default(true),
});

export const reportDeliveries = pgTable("report_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  channel: text("channel").notNull().default("email"),
  providerMessageId: text("provider_message_id"),
  status: text("status")
    .$type<"queued" | "sent" | "delivered" | "bounced" | "failed">()
    .notNull()
    .default("queued"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
});
