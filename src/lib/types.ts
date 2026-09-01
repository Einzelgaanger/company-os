// TypeScript mirror of the Postgres data model (BUILD_SPEC Section 3).

import type { CoordinationMode, CoordinationModeSource } from "./coordination";

export type Role = "owner" | "admin" | "manager" | "member";
export type UserStatus = "invited" | "active" | "disabled";
export type OrgPlan = "pilot" | "starter" | "pro";

export type ConnectionProvider =
  | "gmail"
  | "outlook"
  | "google_calendar"
  | "microsoft_calendar"
  | "google_drive"
  | "onedrive"
  | "slack"
  | "teams"
  | "fathom"
  | "whatsapp";

export type ConnectionStatus = "connected" | "disconnected" | "error" | "expired";

export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export type CommitmentStatus =
  | "open"
  | "in_progress"
  | "at_risk"
  | "overdue"
  | "escalated"
  | "done";

export type Priority = "low" | "medium" | "high" | "critical";

export type SourceType = "meeting" | "email" | "manual" | "whatsapp";

export type CheckinDirection = "outbound" | "inbound";

export type CheckinMessageType =
  | "progress_ping"
  | "direct_followup"
  | "escalation_ping"
  | "confirmation"
  | "daily_pulse"
  | "standup_prep";

export type ParsedStatus = "on_track" | "blocked" | "done" | "unclear" | "snoozed";

/** Meeting type for extraction gating (borrowed from DANI). */
export type MeetingCategory =
  | "catch_up"
  | "deal_origination"
  | "project_execution"
  | "follow_up"
  | "unknown";

export type FeedbackLabel = "accurate" | "incorrect";

export type StatusHistoryChannel = "ui" | "whatsapp" | "api" | "system" | "engine";

export interface CommitmentDependency {
  id: string;
  org_id: string;
  commitment_id: string;
  blocked_by_id: string;
  created_at: string;
}

export interface CommitmentFeedback {
  id: string;
  org_id: string;
  commitment_id: string;
  actor_id: string | null;
  label: FeedbackLabel;
  error_category: string | null;
  note: string | null;
  created_at: string;
}

export interface CommitmentStatusHistory {
  id: string;
  org_id: string;
  commitment_id: string;
  from_status: string | null;
  to_status: string;
  channel: StatusHistoryChannel;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

export type EscalationStatus = "open" | "acknowledged" | "resolved";

export type ReportType = "daily" | "weekly";

// --- Data governance (classification & tagging) --------------------------

/** Sensitivity classification, ordered least → most restrictive. */
export type Sensitivity = "public" | "internal" | "confidential" | "restricted";

export const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  restricted: "Restricted",
};

/** Maximum sensitivity a role may access org-wide (owner/requester always see their own). */
export function clearanceFor(role: Role): Sensitivity {
  switch (role) {
    case "owner":
    case "admin":
      return "restricted";
    case "manager":
      return "confidential";
    default:
      return "internal";
  }
}

export interface Tag {
  id: string;
  org_id: string;
  name: string;
  color: string; // token key: teal | amber | red | green | slate
  classification: Sensitivity; // default sensitivity this tag implies
  pii: boolean; // tag marks personally-identifiable / regulated data
  description: string | null;
  created_at: string;
}

export type DataAccessAction = "view" | "export" | "share" | "reclassify";

export interface DataAccessLogEntry {
  id: string;
  org_id: string;
  actor_id: string;
  entity_type: "commitment" | "meeting" | "project" | "checkin" | "report";
  entity_id: string;
  sensitivity: Sensitivity;
  action: DataAccessAction;
  created_at: string;
}

export interface OrgSettings {
  report_frequency?: "daily" | "weekly" | "both";
  timezone?: string;
  escalation_sla_hours?: number;
  data_retention_months?: 6 | 12 | 24;
  report_channels?: { email: boolean; in_app: boolean; whatsapp: boolean };
  report_recipient_ids?: string[];
  // Governance
  default_classification?: Sensitivity;
  require_classification?: boolean; // block sharing/escalation of untagged data
  // Autonomy engine
  autonomy_enabled?: boolean;
  checkin_stale_hours?: number; // re-check a commitment after this many hours idle
  nudge_after_hours?: number; // nudge if an outbound check-in goes unanswered this long
  // Action-item quality (DANI patterns)
  review_confidence_threshold?: number; // items below this → needs_review (default 0.7)
  outbound_max_age_hours?: number; // recency guard for check-ins (default 168 = 7d)
  daily_digest_enabled?: boolean;
  daily_digest_hour?: number; // local hour 0-23 (default 8)
  // Coordination mode — mirrors tenant_settings.coordination_mode (03_COORDINATION_MODES §3.5)
  coordination_mode?: CoordinationMode;
  coordination_mode_source?: CoordinationModeSource;
  coordination_mode_set_at?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  settings: OrgSettings;
  created_at: string;
}

export interface NotificationPrefs {
  whatsapp_checkins: boolean;
  daily_digest?: boolean;
}

export interface User {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  phone_verified_at: string | null;
  role: Role;
  manager_id: string | null;
  status: UserStatus;
  avatar_url: string | null;
  notification_prefs: NotificationPrefs;
  created_at: string;
  last_active_at: string | null;
}

export interface Connection {
  id: string;
  org_id: string;
  user_id: string | null;
  provider: ConnectionProvider;
  status: ConnectionStatus;
  scopes: string[];
  external_account_email: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  error_message: string | null;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  status: ProjectStatus;
  owner_id: string | null;
  created_at: string;
  // Governance (optional for backward-compat with older stored rows)
  sensitivity?: Sensitivity;
  tag_ids?: string[];
}

export interface MeetingParticipant {
  user_id?: string | null;
  name: string;
  email?: string | null;
}

export interface Meeting {
  id: string;
  org_id: string;
  source: "fathom" | "zoom" | "teams" | "manual";
  external_id: string | null;
  title: string | null;
  participants: MeetingParticipant[];
  transcript_url: string | null;
  recording_url: string | null;
  occurred_at: string | null;
  ingested_at: string;
  processed_at: string | null;
  extracted_commitments_count: number;
  category?: MeetingCategory | null;
  sensitivity?: Sensitivity;
  tag_ids?: string[];
}

export interface Commitment {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  owner_id: string | null;
  owner_external_name: string | null;
  requested_by_id: string | null;
  source_type: SourceType;
  source_meeting_id: string | null;
  due_date: string | null;
  status: CommitmentStatus;
  priority: Priority;
  last_checkin_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Governance
  sensitivity?: Sensitivity;
  tag_ids?: string[];
  classified_by?: "system" | "user" | null; // provenance of the classification
  // Extraction quality (DANI patterns)
  confidence_score?: number | null;
  needs_review?: boolean;
  source_quote?: string | null;
  snoozed_until?: string | null; // YYYY-MM-DD
  /** Self-reported progress 0–100 when known. */
  progress_pct?: number | null;
  /** Review reason when needs_review. */
  review_reason?: string | null;
  /** Flagged as not a real commitment. */
  not_a_commitment?: boolean;
  /** Team id for Team page column. */
  team_id?: string | null;
}

export interface Checkin {
  id: string;
  org_id: string;
  user_id: string;
  commitment_id: string | null;
  direction: CheckinDirection;
  channel: string;
  message_type: CheckinMessageType;
  message_text: string;
  parsed_status: ParsedStatus | null;
  parsed_blocker: string | null;
  twilio_sid: string | null;
  created_at: string;
}

export interface EscalationContextSnapshot {
  commitment: Commitment;
  checkins: Checkin[];
  reason: string;
  sla_hours_elapsed: number;
}

export interface Escalation {
  id: string;
  org_id: string;
  commitment_id: string;
  escalated_to_id: string;
  reason: string;
  context_snapshot: EscalationContextSnapshot;
  status: EscalationStatus;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface OwnershipMapEntry {
  id: string;
  org_id: string;
  category: string;
  primary_owner_id: string;
  backup_owner_id: string | null;
  sla_hours: number;
  /** Keywords / tags used for test routing and escalation match. */
  keywords?: string[];
  /** Scope label (e.g. org / team / project). */
  scope?: string;
  /** Display order (lower first). */
  sort_order?: number;
}

export type MilestoneStatus = "pending" | "in_progress" | "done" | "skipped";

export interface Milestone {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: MilestoneStatus;
  weight: number;
  commitment_ids: string[];
  created_at: string;
}

export type SurveyCycleStatus = "draft" | "pending_review" | "live" | "closed";

export interface SurveyQuestion {
  id: string;
  text: string;
  kind: "scale" | "text" | "choice";
  approved: boolean | null;
}

export interface SurveyCycle {
  id: string;
  org_id: string;
  title: string;
  status: SurveyCycleStatus;
  opens_at: string | null;
  closes_at: string | null;
  questions: SurveyQuestion[];
  response_count: number;
  created_at: string;
}

export interface SurveyAnswer {
  id: string;
  org_id: string;
  cycle_id: string;
  user_id: string;
  answers: Record<string, string | number>;
  submitted_at: string;
}

export type DsrType = "access" | "erasure" | "rectification" | "objection";
export type DsrStatus = "open" | "in_progress" | "fulfilled" | "rejected";

export interface DsrRequest {
  id: string;
  org_id: string;
  user_id: string;
  type: DsrType;
  detail: string | null;
  status: DsrStatus;
  created_at: string;
  /** SLA due (typically created + 30 days). */
  due_at: string | null;
  resolved_at: string | null;
}

export interface MessagingMetrics {
  org_id: string;
  meta_tier: string;
  quality_rating: "green" | "yellow" | "red";
  send_cap_per_day: number;
  sends_last_24h: number;
  opt_out_rate_7d: number;
  block_rate_7d: number;
  opt_in_count: number;
  updated_at: string;
}

export interface OrgTeam {
  id: string;
  org_id: string;
  name: string;
  lead_id: string | null;
  member_ids: string[];
  created_at: string;
}

export interface AuthSessionRow {
  id: string;
  org_id: string;
  user_id: string;
  device: string;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface Report {
  id: string;
  org_id: string;
  type: ReportType;
  period_start: string;
  period_end: string;
  content_md: string;
  content_json: Record<string, unknown>;
  recipient_ids: string[];
  sent_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  org_id: string;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  org_id: string;
  user_id: string;
  kind: "escalation" | "report" | "connection_error" | "system";
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Invite {
  token: string;
  org_id: string;
  email: string;
  role: Role;
  created_at: string;
}

/** Tenant public holiday (working-time maths). */
export interface TenantHoliday {
  id: string;
  org_id: string;
  date: string;
  name: string;
}

/** Ingestion exclusion rule. */
export interface IngestionExclusion {
  id: string;
  org_id: string;
  scope: "user" | "meeting" | "keyword" | "domain";
  match_value: string;
  reason: string | null;
  created_at: string;
}

/** Nudge precision / suspend state by trigger kind. */
export interface NudgeTrigger {
  id: string;
  org_id: string;
  name: string;
  precision: number | null;
  suspended: boolean;
  sends_7d: number;
}

/** Pilot outbound WhatsApp approval queue row. */
export interface MessageApproval {
  id: string;
  org_id: string;
  recipient_user_id: string | null;
  template_key: string;
  preview: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

// Role helpers ------------------------------------------------------------

export const ROLE_RANK: Record<Role, number> = {
  member: 0,
  manager: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
