// TypeScript mirror of the Postgres data model (BUILD_SPEC Section 3).

import type { CoordinationMode, CoordinationModeSource } from "./coordination";

export type Role = "owner" | "admin" | "manager" | "member";
export type UserStatus = "invited" | "active" | "disabled";

export interface OrgInvite {
  token: string;
  org_id: string;
  email: string;
  role: Role;
  manager_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InviteSendResult {
  user: User;
  invite_url: string;
  emailed: boolean;
  email_via: "resend" | "supabase" | null;
}
export type OrgPlan = "pilot" | "starter" | "pro";

/** Connector ids come from the catalog so the two cannot drift. */
import type { ConnectionProvider } from "./providers";
export type { ConnectionProvider };

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

export type SourceType = "meeting" | "email" | "manual" | "whatsapp" | "telegram";

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

export type StatusHistoryChannel = "ui" | "whatsapp" | "telegram" | "api" | "system" | "engine";

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

/**
 * Who can see data carrying a tag.
 * - `everyone`  — anyone in the org cleared for the sensitivity
 * - `only`      — just the named members
 * - `except`    — everyone in the org apart from the named members
 * - `role`      — everyone at or above `min_role`
 */
export type TagAudienceMode = "everyone" | "only" | "except" | "role";

export interface TagAudience {
  mode: TagAudienceMode;
  /** Members named by `only` / `except`. Unused for `everyone` / `role`. */
  member_ids: string[];
  /** Floor role for `role` mode. */
  min_role: Role;
  /**
   * Owners/admins keep break-glass access to data carrying this tag. Turn off
   * for tags whose audience must hold even against org admins (e.g. HR cases
   * an admin is the subject of). Access is written to the data access log
   * either way.
   */
  admin_override: boolean;
}

export const DEFAULT_TAG_AUDIENCE: TagAudience = {
  mode: "everyone",
  member_ids: [],
  min_role: "member",
  admin_override: true,
};

export interface Tag {
  id: string;
  org_id: string;
  name: string;
  color: string; // token key: teal | amber | red | green | slate
  classification: Sensitivity; // default sensitivity this tag implies
  pii: boolean; // tag marks personally-identifiable / regulated data
  description: string | null;
  /** Optional for backward-compat with rows written before audiences existed. */
  audience?: TagAudience;
  created_at: string;
}

// --- Ingestion labelling (what connected apps pull in) --------------------

/** Kinds of content a connected source can hand to Company OS. */
export type IngestionContentKind =
  | "email"
  | "calendar_event"
  | "meeting"
  | "chat_message"
  | "file";

export const INGESTION_CONTENT_LABEL: Record<IngestionContentKind, string> = {
  email: "Emails",
  calendar_event: "Calendar events",
  meeting: "Meeting transcripts",
  chat_message: "Chat messages",
  file: "Files & documents",
};

/** How a rule decides whether an incoming item is its business. */
export type IngestionMatchType = "all" | "keyword" | "from_domain";

/**
 * A rule that stamps a classification (and tags) onto everything a connected
 * app pulls in. The org-wide `default_classification` applies when nothing
 * matches; rules layer on top of it and the most restrictive match wins.
 */
export interface IngestionLabelRule {
  id: string;
  org_id: string;
  name: string;
  /** null = every connected source. */
  provider: ConnectionProvider | null;
  /** null = every kind of content from that source. */
  content_kind: IngestionContentKind | null;
  match_type: IngestionMatchType;
  /** Keyword or domain for `keyword` / `from_domain`; null for `all`. */
  match_value: string | null;
  sensitivity: Sensitivity;
  tag_ids: string[];
  enabled: boolean;
  sort_order: number;
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
  report_channels?: { email: boolean; in_app: boolean; whatsapp: boolean; telegram?: boolean };
  report_recipient_ids?: string[];
  // Governance
  default_classification?: Sensitivity; // floor applied to everything connected apps pull in
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

/** Where Company OS delivers check-ins for this person (one channel, not both). */
export type PreferredMessagingChannel = "in_app" | "telegram" | "whatsapp";

export interface NotificationPrefs {
  /** Master switch for outbound check-ins (any channel). */
  whatsapp_checkins: boolean;
  daily_digest?: boolean;
  /**
   * Preferred delivery channel. Default `in_app` so teams can launch without
   * Telegram/WhatsApp. Telegram/WhatsApp only used when linked + ready.
   */
  preferred_channel?: PreferredMessagingChannel;
}

export interface User {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  phone_verified_at: string | null;
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  telegram_linked_at?: string | null;
  role: Role;
  manager_id: string | null;
  status: UserStatus;
  avatar_url: string | null;
  notification_prefs: NotificationPrefs;
  /** Survey scope when someone is not on a project (0012). */
  department?: string | null;
  /** Per-category email opt-outs (0014). Absent categories default to on. */
  email_prefs?: Record<string, boolean> | null;
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

export type ProjectHealth = "on_track" | "at_risk" | "off_track" | "unknown";

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
  // Delivery (0013). Denormalised from the latest progress snapshot.
  team_id?: string | null;
  /** Routing signals used to match inbound meetings to this project. */
  keywords?: string[];
  client_aliases?: string[];
  start_date?: string | null;
  target_date?: string | null;
  progress_pct?: number | null;
  health?: ProjectHealth | null;
  forecast_completion_date?: string | null;
  last_progress_at?: string | null;
  pulse_enabled?: boolean;
  pulse_interval_days?: number;
}

export type ProjectRole = "lead" | "contributor" | "reviewer" | "observer";

export interface ProjectMember {
  org_id: string;
  project_id: string;
  user_id: string;
  role_in_project: ProjectRole;
  allocation_pct: number;
  added_at: string;
}

export interface Team {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  lead_user_id: string | null;
  parent_team_id: string | null;
  created_at: string;
}

export interface TeamMember {
  org_id: string;
  team_id: string;
  user_id: string;
  role_in_team: "lead" | "member";
  added_at: string;
}

export type PulseStatus = "on_track" | "at_risk" | "blocked" | "done" | "unclear";

/** Attributed project status from one person. Not a survey response. */
export interface ProjectPulse {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  asked_at: string;
  responded_at: string | null;
  status: PulseStatus | null;
  self_progress_pct: number | null;
  progress_note: string | null;
  blocker_text: string | null;
  needs_text: string | null;
  confidence: number | null;
}

export interface ProgressMemberRow {
  user_id: string;
  name: string;
  role_in_project: ProjectRole;
  total_points: number;
  done_points: number;
  /** Null when this person has no tracked work on the project yet. */
  pct: number | null;
  open_count: number;
  overdue_count: number;
  active_titles: string[];
  status: PulseStatus | null;
  self_progress_pct: number | null;
  blocker: string | null;
  needs: string | null;
  last_heard_at: string | null;
}

export interface ProgressInFlightRow {
  commitment_id: string;
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  status: CommitmentStatus;
  due_date: string | null;
  overdue: boolean;
}

export interface ProgressCluster {
  label: string;
  count: number;
}

/**
 * Nightly per-project rollup written by the project-progress Edge Function.
 * progress_pct is priority-weighted commitment delivery only — self-reported
 * pulse progress feeds health and the forecast, never the headline number.
 */
export interface ProjectProgressSnapshot {
  id: string;
  org_id: string;
  project_id: string;
  as_of: string;
  total_points: number;
  done_points: number;
  progress_pct: number;
  commitments_total: number;
  commitments_done: number;
  commitments_active: number;
  commitments_overdue: number;
  commitments_blocked: number;
  open_escalations: number;
  pulses_sent: number;
  pulses_responded: number;
  pulse_on_track: number;
  pulse_at_risk: number;
  pulse_blocked: number;
  member_breakdown: ProgressMemberRow[];
  top_blockers: ProgressCluster[];
  needs: ProgressCluster[];
  in_flight: ProgressInFlightRow[];
  velocity_per_week: number;
  forecast_completion_date: string | null;
  forecast_confidence: number | null;
  forecast_basis: string | null;
  health: ProjectHealth;
  created_at: string;
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

export type UrgencyBand = "critical" | "high" | "medium" | "low";

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
  // Triage (0014). Recomputed hourly by escalation-triage; deterministic, so
  // the queue order is reproducible and explainable.
  urgency_score?: number | null;
  urgency_band?: UrgencyBand | null;
  urgency_rationale?: string | null;
  urgency_computed_at?: string | null;
  /** When this escalation breaches its SLA. */
  due_by?: string | null;
  sla_hours?: number;
  repeat_count?: number;
  project_id?: string | null;
}

export const URGENCY_RANK: Record<UrgencyBand, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

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

// --- Daily scoped surveys (0012) -------------------------------------------
// The production shape. A cycle is one day, for one project or department, and
// every question is open text. Responses are never keyed to a user.

export type SurveyTopic =
  | "clarity"
  | "blockers"
  | "resources"
  | "process"
  | "workload"
  | "dependencies"
  | "tooling"
  | "information";

export type SurveyScopeType = "project" | "department" | "org";

export interface DailySurveyQuestion {
  id: string;
  cycle_id: string;
  sort_order: number;
  question_text: string;
  topic: SurveyTopic;
  /** Why the gap scorer chose this topic today. Shown to admins on review. */
  probe_reason: string | null;
  generated_by: "ai" | "admin" | "template";
  approved: boolean | null;
}

export interface DailySurveyCycle {
  id: string;
  org_id: string;
  scope_type: SurveyScopeType;
  scope_key: string;
  scope_label: string;
  survey_date: string;
  theme: string | null;
  generation_rationale: string | null;
  status: "draft" | "pending_review" | "live" | "closed" | "suppressed" | "failed";
  invited_count: number;
  respondent_count: number;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
  questions?: DailySurveyQuestion[];
}

export interface SurveyTheme {
  theme: string;
  mentionCount: number;
  exampleParaphrase?: string;
}

/**
 * The only readable survey output. The database enforces
 * respondent_count >= 5, so nothing here can identify an individual.
 */
export interface SurveyAggregate {
  id: string;
  org_id: string;
  scope_type: SurveyScopeType | "manager_line";
  scope_key: string;
  scope_label: string;
  period_start: string;
  period_end: string;
  respondent_count: number;
  response_count: number;
  invited_count: number;
  themes: SurveyTheme[];
  questions_asked: Array<{ question: string; topic: string; answers: number }>;
  sentiment_positive_pct: number | null;
  sentiment_neutral_pct: number | null;
  sentiment_negative_pct: number | null;
  created_at: string;
}

export interface MySurveyResponse {
  cycle_id: string;
  scope_label: string;
  survey_date: string;
  question_text: string;
  answer_text: string;
  created_at: string;
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
