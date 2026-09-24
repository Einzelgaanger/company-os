import type {
  AppNotification,
  AuditLogEntry,
  AuthSessionRow,
  Checkin,
  Commitment,
  CommitmentDependency,
  CommitmentFeedback,
  CommitmentStatusHistory,
  Connection,
  DataAccessLogEntry,
  DsrRequest,
  Escalation,
  Meeting,
  MessagingMetrics,
  Milestone,
  Organization,
  OrgTeam,
  OwnershipMapEntry,
  Project,
  Report,
  SurveyAnswer,
  SurveyCycle,
  DailySurveyCycle,
  DailySurveyQuestion,
  SurveyAggregate,
  SurveyTopic,
  Tag,
  TenantHoliday,
  IngestionExclusion,
  IngestionLabelRule,
  NudgeTrigger,
  MessageApproval,
  User,
} from "../types";
import { expandSeedHeavy } from "./seedHeavy";

// Fixed IDs for readable demo data.
const ORG = "org-prodg";

const U = {
  alfred: "u-alfred",
  grace: "u-grace",
  kayode: "u-kayode",
  wanjiru: "u-wanjiru",
  brian: "u-brian",
  amina: "u-amina",
};

function iso(daysFromNow: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateOnly(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * Mock-only survey response. Production deliberately has no user_id on
 * survey_responses — it stores an unreversible respondent_hash instead. The
 * demo store keys by user purely so it can answer "have I already responded?"
 * without reimplementing HMAC in the browser. Nothing reads answer_text back
 * against a person.
 */
export interface DailySurveyResponseMock {
  cycle_id: string;
  question_id: string;
  user_id: string;
  answer_text: string;
  created_at: string;
}

export interface SeedData {
  organizations: Organization[];
  users: User[];
  connections: Connection[];
  projects: Project[];
  meetings: Meeting[];
  commitments: Commitment[];
  checkins: Checkin[];
  escalations: Escalation[];
  ownership_map: OwnershipMapEntry[];
  reports: Report[];
  audit_log: AuditLogEntry[];
  notifications: AppNotification[];
  tags: Tag[];
  ingestion_label_rules: IngestionLabelRule[];
  data_access_log: DataAccessLogEntry[];
  commitment_dependencies: CommitmentDependency[];
  commitment_feedback: CommitmentFeedback[];
  commitment_status_history: CommitmentStatusHistory[];
  milestones: Milestone[];
  survey_cycles: SurveyCycle[];
  survey_answers: SurveyAnswer[];
  daily_survey_cycles: DailySurveyCycle[];
  daily_survey_questions: DailySurveyQuestion[];
  daily_survey_responses: DailySurveyResponseMock[];
  survey_aggregates: SurveyAggregate[];
  dsr_requests: DsrRequest[];
  messaging_metrics: MessagingMetrics[];
  org_teams: OrgTeam[];
  auth_sessions: AuthSessionRow[];
  holidays: TenantHoliday[];
  ingestion_exclusions: IngestionExclusion[];
  nudge_triggers: NudgeTrigger[];
  message_approvals: MessageApproval[];
}

const TAG = {
  client: "tag-client",
  financials: "tag-financials",
  engineering: "tag-engineering",
  pii: "tag-pii",
  hr: "tag-hr",
  legal: "tag-legal",
  credentials: "tag-credentials",
};

export function buildSeed(): SeedData {
  const organizations: Organization[] = [
    {
      id: ORG,
      name: "ProDG Studios",
      slug: "prodg-studios",
      plan: "pilot",
      settings: {
        report_frequency: "daily",
        timezone: "Africa/Nairobi",
        escalation_sla_hours: 24,
        data_retention_months: 12,
        report_channels: { email: true, in_app: true, whatsapp: false },
        report_recipient_ids: [U.alfred, U.grace],
        default_classification: "internal",
        require_classification: true,
        autonomy_enabled: true,
        checkin_stale_hours: 48,
        nudge_after_hours: 24,
        review_confidence_threshold: 0.7,
        outbound_max_age_hours: 168,
        daily_digest_enabled: true,
        daily_digest_hour: 8,
      },
      created_at: iso(-40),
    },
  ];

  const users: User[] = [
    {
      id: U.alfred,
      org_id: ORG,
      full_name: "Alfred Maweu",
      email: "alfred@prodg.studio",
      department: "Leadership",
      phone_number: "+254700000001",
      phone_verified_at: iso(-39),
      role: "owner",
      manager_id: null,
      status: "active",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
      created_at: iso(-40),
      last_active_at: iso(0, 8),
    },
    {
      id: U.grace,
      org_id: ORG,
      full_name: "Grace Otieno",
      email: "grace@prodg.studio",
      department: "Operations",
      phone_number: "+254700000002",
      phone_verified_at: iso(-38),
      role: "admin",
      manager_id: U.alfred,
      status: "active",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
      created_at: iso(-38),
      last_active_at: iso(0, 7),
    },
    {
      id: U.wanjiru,
      org_id: ORG,
      full_name: "Wanjiru Kamau",
      email: "wanjiru@prodg.studio",
      department: "Delivery",
      phone_number: "+254700000003",
      phone_verified_at: iso(-30),
      role: "manager",
      manager_id: U.alfred,
      status: "active",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
      created_at: iso(-30),
      last_active_at: iso(-1, 16),
    },
    {
      id: U.kayode,
      org_id: ORG,
      full_name: "Kayode Adeyemi",
      email: "kayode@prodg.studio",
      department: "Engineering",
      phone_number: "+254700000004",
      phone_verified_at: iso(-29),
      role: "member",
      manager_id: U.wanjiru,
      status: "active",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
      created_at: iso(-29),
      last_active_at: iso(-1, 11),
    },
    {
      id: U.brian,
      org_id: ORG,
      full_name: "Brian Njoroge",
      email: "brian@prodg.studio",
      department: "Engineering",
      phone_number: "+254700000005",
      phone_verified_at: null,
      role: "member",
      manager_id: U.wanjiru,
      status: "active",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
      created_at: iso(-20),
      last_active_at: iso(-2, 14),
    },
    {
      id: U.amina,
      org_id: ORG,
      full_name: "Amina Hassan",
      email: "amina@prodg.studio",
      department: "Operations",
      phone_number: null,
      phone_verified_at: null,
      role: "member",
      manager_id: U.grace,
      status: "invited",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
      created_at: iso(-3),
      last_active_at: null,
    },
  ];

  const connections: Connection[] = [
    {
      id: "c-fathom",
      org_id: ORG,
      user_id: null,
      provider: "fathom",
      status: "connected",
      scopes: ["recordings.read"],
      external_account_email: "ops@prodg.studio",
      connected_at: iso(-39),
      last_synced_at: iso(0, 8),
      error_message: null,
    },
    {
      id: "c-gmail-alfred",
      org_id: ORG,
      user_id: U.alfred,
      provider: "gmail",
      status: "connected",
      scopes: ["gmail.readonly"],
      external_account_email: "alfred@prodg.studio",
      connected_at: iso(-39),
      last_synced_at: iso(0, 8),
      error_message: null,
    },
    {
      id: "c-gcal-alfred",
      org_id: ORG,
      user_id: U.alfred,
      provider: "google_calendar",
      status: "expired",
      scopes: ["calendar.readonly"],
      external_account_email: "alfred@prodg.studio",
      connected_at: iso(-39),
      last_synced_at: iso(-4, 8),
      error_message: "Token expired — reconnect needed.",
    },
  ];

  const projects: Project[] = [
    {
      id: "p-vgg",
      org_id: ORG,
      name: "VGG Data Platform",
      description: "Data platform build for VGG, incl. SharePoint usage analytics.",
      client_name: "VGG",
      status: "active",
      owner_id: U.wanjiru,
      created_at: iso(-35),
      sensitivity: "confidential",
      tag_ids: [TAG.client],
    },
    {
      id: "p-onboarding",
      org_id: ORG,
      name: "Client Onboarding Q3",
      description: "Standardising the Q3 onboarding flow across new clients.",
      client_name: null,
      status: "active",
      owner_id: U.grace,
      created_at: iso(-22),
    },
    {
      id: "p-brand",
      org_id: ORG,
      name: "Brand Refresh",
      description: "Internal brand and website refresh.",
      client_name: null,
      status: "on_hold",
      owner_id: U.alfred,
      created_at: iso(-15),
    },
  ];

  const meetings: Meeting[] = [
    {
      id: "m-vgg-sync",
      org_id: ORG,
      source: "fathom",
      external_id: "fathom-abc123",
      title: "VGG Weekly Sync",
      sensitivity: "confidential",
      tag_ids: [TAG.client],
      participants: [
        { user_id: U.alfred, name: "Alfred Maweu", email: "alfred@prodg.studio" },
        { user_id: U.kayode, name: "Kayode Adeyemi", email: "kayode@prodg.studio" },
        { user_id: U.wanjiru, name: "Wanjiru Kamau", email: "wanjiru@prodg.studio" },
        { name: "David (VGG)", email: "david@vgg.example" },
      ],
      transcript_url: "https://fathom.video/transcript/abc123",
      recording_url: "https://fathom.video/recording/abc123",
      occurred_at: iso(-3, 10),
      ingested_at: iso(-3, 11),
      processed_at: iso(-3, 11),
      extracted_commitments_count: 2,
      category: "project_execution",
    },
    {
      id: "m-onboarding-kickoff",
      org_id: ORG,
      source: "fathom",
      external_id: "fathom-def456",
      title: "Onboarding Process Kickoff",
      sensitivity: "internal",
      tag_ids: [],
      participants: [
        { user_id: U.grace, name: "Grace Otieno", email: "grace@prodg.studio" },
        { user_id: U.brian, name: "Brian Njoroge", email: "brian@prodg.studio" },
      ],
      transcript_url: "https://fathom.video/transcript/def456",
      recording_url: null,
      occurred_at: iso(-5, 14),
      ingested_at: iso(-5, 15),
      processed_at: null,
      extracted_commitments_count: 0,
      category: "follow_up",
    },
  ];

  const commitments: Commitment[] = [
    {
      id: "cm-sharepoint",
      org_id: ORG,
      project_id: "p-vgg",
      title: "Share SharePoint usage data (column D)",
      sensitivity: "confidential",
      tag_ids: [TAG.client],
      classified_by: "system",
      description:
        "Alfred needs the SharePoint usage export, specifically column D, for the VGG platform analytics.",
      owner_id: U.kayode,
      owner_external_name: null,
      requested_by_id: U.alfred,
      source_type: "meeting",
      source_meeting_id: "m-vgg-sync",
      due_date: dateOnly(-1),
      status: "escalated",
      priority: "high",
      last_checkin_at: iso(-1, 9),
      created_at: iso(-3, 11),
      updated_at: iso(0, 9),
      resolved_at: null,
      confidence_score: 0.92,
      needs_review: false,
      source_quote: "Kayode, can you share the SharePoint usage data — specifically column D — before Friday?",
      snoozed_until: null,
    },
    {
      id: "cm-api-spec",
      org_id: ORG,
      project_id: "p-vgg",
      title: "Draft VGG ingestion API spec",
      sensitivity: "internal",
      tag_ids: [TAG.engineering],
      classified_by: "system",
      description: "First draft of the ingestion endpoint contract.",
      owner_id: U.wanjiru,
      owner_external_name: null,
      requested_by_id: U.alfred,
      source_type: "meeting",
      source_meeting_id: "m-vgg-sync",
      due_date: dateOnly(2),
      status: "in_progress",
      priority: "medium",
      last_checkin_at: iso(-1, 9),
      created_at: iso(-3, 11),
      updated_at: iso(-1, 9),
      resolved_at: null,
      confidence_score: 0.88,
      needs_review: false,
      source_quote: "Wanjiru will draft the ingestion API spec and circulate it mid-week.",
      snoozed_until: null,
    },
    {
      id: "cm-review-vague",
      org_id: ORG,
      project_id: "p-vgg",
      title: "Follow up on the Kenya thing",
      sensitivity: "internal",
      tag_ids: [],
      classified_by: "system",
      description: "Low-confidence extraction — likely too vague.",
      owner_id: U.amina,
      owner_external_name: null,
      requested_by_id: U.alfred,
      source_type: "meeting",
      source_meeting_id: "m-vgg-sync",
      due_date: dateOnly(1),
      status: "open",
      priority: "medium",
      last_checkin_at: null,
      created_at: iso(-1, 12),
      updated_at: iso(-1, 12),
      resolved_at: null,
      confidence_score: 0.41,
      needs_review: true,
      review_reason: "Low confidence — title too vague to act on",
      source_quote: "Someone should probably follow up on the Kenya thing.",
      snoozed_until: null,
    },
    {
      id: "cm-onboarding-doc",
      org_id: ORG,
      project_id: "p-onboarding",
      title: "Write onboarding checklist v1",
      sensitivity: "internal",
      tag_ids: [],
      classified_by: "system",
      description: null,
      owner_id: U.brian,
      owner_external_name: null,
      requested_by_id: U.grace,
      source_type: "manual",
      source_meeting_id: null,
      due_date: dateOnly(-2),
      status: "overdue",
      priority: "medium",
      last_checkin_at: iso(-1, 9),
      created_at: iso(-6, 10),
      updated_at: iso(-1, 9),
      resolved_at: null,
    },
    {
      id: "cm-brand-logo",
      org_id: ORG,
      project_id: "p-brand",
      title: "Deliver logo concepts",
      sensitivity: "internal",
      tag_ids: [],
      classified_by: "system",
      description: null,
      owner_id: U.grace,
      owner_external_name: null,
      requested_by_id: U.alfred,
      source_type: "manual",
      source_meeting_id: null,
      due_date: dateOnly(5),
      status: "open",
      priority: "low",
      last_checkin_at: null,
      created_at: iso(-10, 10),
      updated_at: iso(-10, 10),
      resolved_at: null,
    },
    {
      id: "cm-vendor-invoice",
      org_id: ORG,
      project_id: "p-onboarding",
      title: "Confirm vendor invoice details",
      sensitivity: "confidential",
      tag_ids: [TAG.financials],
      classified_by: "system",
      description: null,
      owner_id: null,
      owner_external_name: "David (VGG)",
      requested_by_id: U.grace,
      source_type: "email",
      source_meeting_id: null,
      due_date: dateOnly(1),
      status: "at_risk",
      priority: "medium",
      last_checkin_at: null,
      created_at: iso(-4, 10),
      updated_at: iso(-4, 10),
      resolved_at: null,
    },
    {
      id: "cm-done-report",
      org_id: ORG,
      project_id: "p-vgg",
      title: "Send Q2 performance summary",
      sensitivity: "confidential",
      tag_ids: [TAG.financials],
      classified_by: "system",
      description: null,
      owner_id: U.wanjiru,
      owner_external_name: null,
      requested_by_id: U.alfred,
      source_type: "manual",
      source_meeting_id: null,
      due_date: dateOnly(-7),
      status: "done",
      priority: "medium",
      last_checkin_at: iso(-7, 9),
      created_at: iso(-12, 10),
      updated_at: iso(-7, 12),
      resolved_at: iso(-7, 12),
    },
  ];

  const checkins: Checkin[] = [
    {
      id: "ck-1",
      org_id: ORG,
      user_id: U.kayode,
      commitment_id: "cm-sharepoint",
      direction: "outbound",
      channel: "whatsapp",
      message_type: "direct_followup",
      message_text:
        "Hi Kayode, following up on Share SharePoint usage data (column D), which Alfred needs by " +
        dateOnly(-1) +
        ". Has this been shared / done yet?",
      parsed_status: null,
      parsed_blocker: null,
      twilio_sid: "SM-demo-1",
      created_at: iso(-1, 9),
    },
    {
      id: "ck-2",
      org_id: ORG,
      user_id: U.kayode,
      commitment_id: "cm-sharepoint",
      direction: "inbound",
      channel: "whatsapp",
      message_type: "direct_followup",
      message_text: "I don't have it, someone else handles that data.",
      parsed_status: "blocked",
      parsed_blocker: "Kayode is not the owner of the SharePoint usage data.",
      twilio_sid: "SM-demo-2",
      created_at: iso(-1, 10),
    },
    {
      id: "ck-3",
      org_id: ORG,
      user_id: U.brian,
      commitment_id: "cm-onboarding-doc",
      direction: "outbound",
      channel: "whatsapp",
      message_type: "direct_followup",
      message_text:
        "Hi Brian, following up on Write onboarding checklist v1, which Grace needs. Any progress?",
      parsed_status: null,
      parsed_blocker: null,
      twilio_sid: "SM-demo-3",
      created_at: iso(-1, 9),
    },
  ];

  const escalations: Escalation[] = [
    {
      id: "es-sharepoint",
      org_id: ORG,
      commitment_id: "cm-sharepoint",
      escalated_to_id: U.grace,
      reason: "Owner reported they are not responsible for this data (blocked).",
      status: "open",
      created_at: iso(0, 9),
      acknowledged_at: null,
      resolved_at: null,
      context_snapshot: {
        commitment: commitments.find((c) => c.id === "cm-sharepoint")!,
        checkins: checkins.filter((c) => c.commitment_id === "cm-sharepoint"),
        reason: "Owner reported they are not responsible for this data (blocked).",
        sla_hours_elapsed: 26,
      },
    },
  ];

  const ownership_map: OwnershipMapEntry[] = [
    {
      id: "om-data",
      org_id: ORG,
      category: "data requests",
      primary_owner_id: U.grace,
      backup_owner_id: U.wanjiru,
      sla_hours: 24,
      keywords: ["sharepoint", "data", "usage"],
      scope: "org",
      sort_order: 0,
    },
    {
      id: "om-client",
      org_id: ORG,
      category: "client deliverables",
      primary_owner_id: U.wanjiru,
      backup_owner_id: U.alfred,
      sla_hours: 12,
      keywords: ["client", "deliverable", "vgg"],
      scope: "org",
      sort_order: 1,
    },
  ];

  const reports: Report[] = [
    {
      id: "r-daily-1",
      org_id: ORG,
      type: "daily",
      period_start: dateOnly(-1),
      period_end: dateOnly(0),
      recipient_ids: [U.alfred, U.grace],
      sent_at: iso(0, 8),
      created_at: iso(0, 8),
      content_json: {
        open: 4,
        at_risk: 1,
        overdue: 1,
        escalated: 1,
        resolved: 1,
      },
      content_md: [
        "## Daily summary — ProDG Studios",
        "",
        "**Headline:** 1 escalation opened, 1 commitment resolved, 1 project at risk.",
        "",
        "### Needs your attention",
        "- **Share SharePoint usage data (column D)** — escalated to Grace Otieno (owner said they don't handle this data).",
        "- **Write onboarding checklist v1** — overdue by 2 days (Brian Njoroge).",
        "",
        "### Project health",
        "- VGG Data Platform — amber (1 escalated item)",
        "- Client Onboarding Q3 — amber (1 overdue item)",
        "- Brand Refresh — green (on hold)",
        "",
        "### Team pulse",
        "- One recurring theme this week: ownership of data exports is unclear across the VGG workstream.",
        "",
        "### Progress since last report",
        "- Q2 performance summary delivered.",
      ].join("\n"),
    },
  ];

  const audit_log: AuditLogEntry[] = [
    {
      id: "al-1",
      org_id: ORG,
      actor: "system",
      action: "escalation.created",
      target_type: "escalation",
      target_id: "es-sharepoint",
      metadata: { commitment_id: "cm-sharepoint", escalated_to: U.grace },
      created_at: iso(0, 9),
    },
    {
      id: "al-2",
      org_id: ORG,
      actor: U.alfred,
      action: "connection.connected",
      target_type: "connection",
      target_id: "c-fathom",
      metadata: { provider: "fathom" },
      created_at: iso(-39),
    },
  ];

  const tags: Tag[] = [
    { id: TAG.client, org_id: ORG, name: "client data", color: "teal", classification: "confidential", pii: false, description: "Data belonging to or about a client.", audience: { mode: "everyone", member_ids: [], min_role: "member", admin_override: true }, created_at: iso(-39) },
    { id: TAG.financials, org_id: ORG, name: "financials", color: "amber", classification: "confidential", pii: false, description: "Revenue, invoices, budgets, pricing.", audience: { mode: "only", member_ids: [U.alfred, U.grace, U.amina], min_role: "member", admin_override: true }, created_at: iso(-39) },
    { id: TAG.engineering, org_id: ORG, name: "engineering", color: "slate", classification: "internal", pii: false, description: "Specs, APIs, infrastructure.", audience: { mode: "everyone", member_ids: [], min_role: "member", admin_override: true }, created_at: iso(-39) },
    { id: TAG.pii, org_id: ORG, name: "pii", color: "red", classification: "restricted", pii: true, description: "Personally identifiable information.", audience: { mode: "role", member_ids: [], min_role: "admin", admin_override: true }, created_at: iso(-39) },
    { id: TAG.hr, org_id: ORG, name: "hr", color: "red", classification: "restricted", pii: true, description: "People, payroll, performance.", audience: { mode: "only", member_ids: [U.grace], min_role: "member", admin_override: false }, created_at: iso(-39) },
    { id: TAG.legal, org_id: ORG, name: "legal", color: "amber", classification: "confidential", pii: false, description: "Contracts, NDAs, compliance.", audience: { mode: "role", member_ids: [], min_role: "manager", admin_override: true }, created_at: iso(-39) },
    { id: TAG.credentials, org_id: ORG, name: "credentials", color: "red", classification: "restricted", pii: false, description: "Secrets, keys, passwords.", audience: { mode: "except", member_ids: [U.brian], min_role: "member", admin_override: true }, created_at: iso(-39) },
  ];

  // Everything connected apps pull in is "internal" (org default) unless a rule
  // below raises it. Ordered most-general first; the strictest match wins.
  const ingestion_label_rules: IngestionLabelRule[] = [
    {
      id: "ilr-email-confidential",
      org_id: ORG,
      name: "Email is confidential by default",
      provider: null,
      content_kind: "email",
      match_type: "all",
      match_value: null,
      sensitivity: "confidential",
      tag_ids: [],
      enabled: true,
      sort_order: 10,
      created_at: iso(-39),
    },
    {
      id: "ilr-client-domain",
      org_id: ORG,
      name: "Mail from VGG is client data",
      provider: null,
      content_kind: "email",
      match_type: "from_domain",
      match_value: "vggafrica.com",
      sensitivity: "confidential",
      tag_ids: [TAG.client],
      enabled: true,
      sort_order: 20,
      created_at: iso(-30),
    },
    {
      id: "ilr-payroll",
      org_id: ORG,
      name: "Payroll talk is restricted",
      provider: null,
      content_kind: null,
      match_type: "keyword",
      match_value: "payroll",
      sensitivity: "restricted",
      tag_ids: [TAG.hr, TAG.pii],
      enabled: true,
      sort_order: 30,
      created_at: iso(-30),
    },
    {
      id: "ilr-drive-files",
      org_id: ORG,
      name: "Drive files stay internal",
      provider: "google_drive",
      content_kind: "file",
      match_type: "all",
      match_value: null,
      sensitivity: "internal",
      tag_ids: [],
      enabled: true,
      sort_order: 40,
      created_at: iso(-28),
    },
  ];

  const data_access_log: DataAccessLogEntry[] = [
    { id: "dal-1", org_id: ORG, actor_id: U.grace, entity_type: "commitment", entity_id: "cm-sharepoint", sensitivity: "confidential", action: "view", created_at: iso(0, 9) },
    { id: "dal-2", org_id: ORG, actor_id: U.alfred, entity_type: "meeting", entity_id: "m-vgg-sync", sensitivity: "confidential", action: "view", created_at: iso(-3, 11) },
  ];

  const notifications: AppNotification[] = [
    {
      id: "n-1",
      org_id: ORG,
      user_id: U.grace,
      kind: "escalation",
      title: "Escalation assigned to you",
      body: "Share SharePoint usage data (column D) needs your help to unblock.",
      link: "/escalations/es-sharepoint",
      read_at: null,
      created_at: iso(0, 9),
    },
    {
      id: "n-2",
      org_id: ORG,
      user_id: U.alfred,
      kind: "report",
      title: "Daily report published",
      body: "Your daily summary for ProDG Studios is ready.",
      link: "/reports/r-daily-1",
      read_at: null,
      created_at: iso(0, 8),
    },
    {
      id: "n-3",
      org_id: ORG,
      user_id: U.alfred,
      kind: "connection_error",
      title: "Google Calendar needs reconnecting",
      body: "The token for alfred@prodg.studio has expired.",
      link: "/integrations",
      read_at: null,
      created_at: iso(-4, 8),
    },
  ];

  // Backfill quality defaults on older seed rows
  for (const c of commitments) {
    if (c.confidence_score === undefined) c.confidence_score = c.needs_review ? 0.5 : 0.85;
    if (c.needs_review === undefined) c.needs_review = false;
    if (c.source_quote === undefined) c.source_quote = null;
    if (c.snoozed_until === undefined) c.snoozed_until = null;
  }

  const commitment_dependencies: CommitmentDependency[] = [
    {
      id: "dep-1",
      org_id: ORG,
      commitment_id: "cm-api-spec",
      blocked_by_id: "cm-sharepoint",
      created_at: iso(-2, 10),
    },
  ];

  const commitment_feedback: CommitmentFeedback[] = [];

  const commitment_status_history: CommitmentStatusHistory[] = [
    {
      id: "hist-1",
      org_id: ORG,
      commitment_id: "cm-review-vague",
      from_status: null,
      to_status: "open",
      channel: "system",
      actor_id: null,
      note: "Extracted — queued for review",
      created_at: iso(-1, 12),
    },
    {
      id: "hist-2",
      org_id: ORG,
      commitment_id: "cm-sharepoint",
      from_status: "at_risk",
      to_status: "escalated",
      channel: "engine",
      actor_id: null,
      note: "Escalated after blocked reply",
      created_at: iso(0, 9),
    },
  ];

  const milestones: Milestone[] = [
    {
      id: "ms-vgg-1",
      org_id: ORG,
      project_id: "p-vgg",
      title: "API contract locked",
      due_date: dateOnly(5),
      status: "in_progress",
      weight: 2,
      commitment_ids: ["cm-api-spec"],
      created_at: iso(-10),
    },
    {
      id: "ms-vgg-2",
      org_id: ORG,
      project_id: "p-vgg",
      title: "SharePoint data shared",
      due_date: dateOnly(-1),
      status: "pending",
      weight: 3,
      commitment_ids: ["cm-sharepoint"],
      created_at: iso(-10),
    },
    {
      id: "ms-onb-1",
      org_id: ORG,
      project_id: "p-onboarding",
      title: "Checklist v1 shipped",
      due_date: dateOnly(7),
      status: "in_progress",
      weight: 1,
      commitment_ids: ["cm-onboarding-doc"],
      created_at: iso(-5),
    },
  ];

  const survey_cycles: SurveyCycle[] = [
    {
      id: "sv-current",
      org_id: ORG,
      title: "August pulse — blockers & clarity",
      status: "live",
      opens_at: iso(-3),
      closes_at: iso(4),
      questions: [
        { id: "q1", text: "How clear are your priorities this week?", kind: "scale", approved: true },
        { id: "q2", text: "What's blocking progress most?", kind: "text", approved: true },
        { id: "q3", text: "Do you have what you need from others?", kind: "choice", approved: true },
      ],
      response_count: 2,
      created_at: iso(-5),
    },
    {
      id: "sv-review",
      org_id: ORG,
      title: "September draft — generated questions",
      status: "pending_review",
      opens_at: null,
      closes_at: null,
      questions: [
        { id: "rq1", text: "How sustainable is your current workload pace?", kind: "scale", approved: null },
        { id: "rq2", text: "Which handoffs feel slowest?", kind: "text", approved: null },
        { id: "rq3", text: "Is meeting load helping or hurting delivery?", kind: "choice", approved: null },
      ],
      response_count: 0,
      created_at: iso(-1),
    },
    {
      id: "sv-closed",
      org_id: ORG,
      title: "July pulse",
      status: "closed",
      opens_at: iso(-40),
      closes_at: iso(-33),
      questions: [
        { id: "cq1", text: "How clear were priorities last month?", kind: "scale", approved: true },
      ],
      response_count: 6,
      created_at: iso(-45),
    },
  ];

  const survey_answers: SurveyAnswer[] = [
    {
      id: "sa-1",
      org_id: ORG,
      cycle_id: "sv-current",
      user_id: U.brian,
      answers: { q1: 4, q2: "Waiting on SharePoint access", q3: "Mostly" },
      submitted_at: iso(-1),
    },
  ];

  // --- Daily scoped surveys (0012) -------------------------------------------
  // Two live cycles on different scopes, one closed, one awaiting review. The
  // aggregates below are what managers actually read; the raw responses exist
  // only so the demo can show a cycle filling up.

  const daily_survey_cycles: DailySurveyCycle[] = [
    {
      id: "dsc-vgg-today",
      org_id: ORG,
      scope_type: "project",
      scope_key: "p-vgg",
      scope_label: "VGG Data Platform",
      survey_date: dateOnly(0),
      theme: "Handoffs and dependency waits",
      generation_rationale:
        "Three commitments on this project went overdue this week and two replies mentioned waiting on another team, so today probes dependencies and blockers rather than clarity.",
      status: "live",
      invited_count: 7,
      respondent_count: 4,
      created_at: iso(0, 3),
      opened_at: iso(0, 9),
      closed_at: null,
    },
    {
      id: "dsc-ops-today",
      org_id: ORG,
      scope_type: "department",
      scope_key: "Operations",
      scope_label: "Operations",
      survey_date: dateOnly(0),
      theme: "Tooling friction",
      generation_rationale:
        "Tooling has not been probed in 11 days and two escalations last week cited access delays.",
      status: "live",
      invited_count: 6,
      respondent_count: 5,
      created_at: iso(0, 3),
      opened_at: iso(0, 9),
      closed_at: null,
    },
    {
      id: "dsc-org-today",
      org_id: ORG,
      scope_type: "org",
      scope_key: ORG,
      scope_label: "Whole company",
      survey_date: dateOnly(0),
      theme: "General performance and trajectory",
      generation_rationale:
        "Catch-all cycle for anyone not currently attached to a project or department cycle. These answers are what the weekly company roll-up is built from.",
      status: "live",
      invited_count: 9,
      respondent_count: 6,
      created_at: iso(0, 3),
      opened_at: iso(0, 9),
      closed_at: null,
    },
    {
      id: "dsc-vgg-yesterday",
      org_id: ORG,
      scope_type: "project",
      scope_key: "p-vgg",
      scope_label: "VGG Data Platform",
      survey_date: dateOnly(-1),
      theme: "Priority clarity",
      generation_rationale:
        "Scope changed on Monday and no clarity signal has been collected since.",
      status: "closed",
      invited_count: 7,
      respondent_count: 6,
      created_at: iso(-1, 3),
      opened_at: iso(-1, 9),
      closed_at: iso(-1, 23),
    },
    {
      id: "dsc-vgg-tomorrow",
      org_id: ORG,
      scope_type: "project",
      scope_key: "p-vgg",
      scope_label: "VGG Data Platform",
      survey_date: dateOnly(1),
      theme: "Workload sustainability",
      generation_rationale:
        "Commitment load per person rose 40% week over week with no corresponding change in headcount.",
      status: "pending_review",
      invited_count: 7,
      respondent_count: 0,
      created_at: iso(0, 3),
      opened_at: null,
      closed_at: null,
    },
  ];

  function q(
    cycle_id: string,
    sort_order: number,
    topic: SurveyTopic,
    question_text: string,
    probe_reason: string,
    approved: boolean | null = true,
  ): DailySurveyQuestion {
    return {
      id: `dsq-${cycle_id}-${sort_order}`,
      cycle_id,
      sort_order,
      question_text,
      topic,
      probe_reason,
      generated_by: "ai",
      approved,
    };
  }

  const daily_survey_questions: DailySurveyQuestion[] = [
    q("dsc-vgg-today", 1, "dependencies", "What are you waiting on from another team right now, and how long has it been?", "3 commitments overdue with blocked replies"),
    q("dsc-vgg-today", 2, "blockers", "If VGG slipped a week, what would you say caused it?", "Delivery rate trailing plan"),
    q("dsc-vgg-today", 3, "process", "Where does work on this project sit idle waiting for a decision?", "Two commitments idle >5 days"),
    q("dsc-vgg-today", 4, "information", "What did you need to know this week that you had to go hunting for?", "Information not probed in 9 days"),
    q("dsc-vgg-today", 5, "resources", "What would you need to move faster that you do not have today?", "Escalations mention access delays"),

    q("dsc-ops-today", 1, "tooling", "Which tool slowed you down most this week, and at what point exactly?", "Tooling last probed 11 days ago"),
    q("dsc-ops-today", 2, "process", "What step in your routine work feels heavier than it should be?", "Process signal stale"),
    q("dsc-ops-today", 3, "resources", "What access or permission have you had to ask for more than once?", "2 escalations cited access"),
    q("dsc-ops-today", 4, "workload", "How does this week's volume compare with what feels sustainable?", "Workload unprobed this cycle"),
    q("dsc-ops-today", 5, "information", "What do you wish you were told earlier this week?", "Information gap score high"),

    q("dsc-org-today", 1, "clarity", "What is the most important thing for the company to get right this month?", "Company trajectory probe, asked weekly"),
    q("dsc-org-today", 2, "blockers", "What slows work down here that has become normal?", "Standing blocker probe"),
    q("dsc-org-today", 3, "process", "Where do you see effort being duplicated across teams?", "Duplicate-work theme recurring 3 weeks"),
    q("dsc-org-today", 4, "information", "What do you not know about how the company is doing that you'd like to?", "Information gap score high org-wide"),
    q("dsc-org-today", 5, "resources", "If you could add one thing to help the company perform better, what would it be?", "Open trajectory probe"),

    q("dsc-vgg-yesterday", 1, "clarity", "What is the single most important thing for you to finish this week?", "Scope changed Monday"),
    q("dsc-vgg-yesterday", 2, "clarity", "Where are you unsure who owns a piece of work?", "Ownership questions in replies"),
    q("dsc-vgg-yesterday", 3, "blockers", "What is slowing you down that nobody has asked about?", "Standing blocker probe"),
    q("dsc-vgg-yesterday", 4, "dependencies", "Which handoff into your work is least predictable?", "Dependency chain on VGG"),
    q("dsc-vgg-yesterday", 5, "process", "What would you change about how this project runs?", "Open-ended process probe"),

    q("dsc-vgg-tomorrow", 1, "workload", "How sustainable is your current pace over the next month?", "Load per person up 40%", null),
    q("dsc-vgg-tomorrow", 2, "workload", "What would you drop first if you had to drop something?", "Prioritisation under load", null),
    q("dsc-vgg-tomorrow", 3, "blockers", "What is taking longer than you expected, and why?", "Velocity below forecast", null),
    q("dsc-vgg-tomorrow", 4, "resources", "Where is the team thinnest right now?", "Capacity signal missing", null),
    q("dsc-vgg-tomorrow", 5, "information", "What decision are you waiting on to plan your week?", "Decision latency rising", null),
  ];

  const daily_survey_responses: DailySurveyResponseMock[] = [
    { cycle_id: "dsc-vgg-today", question_id: "dsq-dsc-vgg-today-1", user_id: U.brian, answer_text: "Still waiting on the SharePoint migration sign-off. Eight days now.", created_at: iso(0, 10) },
    { cycle_id: "dsc-vgg-today", question_id: "dsq-dsc-vgg-today-2", user_id: U.brian, answer_text: "Data validation is taking far longer than anyone scoped.", created_at: iso(0, 10) },
    { cycle_id: "dsc-vgg-today", question_id: "dsq-dsc-vgg-today-1", user_id: U.amina, answer_text: "Blocked on finance approving the vendor contract.", created_at: iso(0, 11) },
  ];

  const survey_aggregates: SurveyAggregate[] = [
    {
      id: "sag-vgg-w1",
      org_id: ORG,
      scope_type: "project",
      scope_key: "p-vgg",
      scope_label: "VGG Data Platform",
      period_start: dateOnly(-7),
      period_end: dateOnly(-1),
      respondent_count: 7,
      response_count: 31,
      invited_count: 7,
      themes: [
        { theme: "Waiting on sign-off from outside the team", mentionCount: 9, exampleParaphrase: "Several people described approvals sitting with finance or legal for over a week." },
        { theme: "Data validation scoped too optimistically", mentionCount: 6, exampleParaphrase: "The validation step is consistently described as larger than planned." },
        { theme: "Unclear ownership of the cutover checklist", mentionCount: 4, exampleParaphrase: "More than one person believes someone else owns the final checklist." },
        { theme: "Environment access requested repeatedly", mentionCount: 3, exampleParaphrase: "Access requests are being re-submitted because the first request went unanswered." },
      ],
      questions_asked: [
        { question: "What are you waiting on from another team right now?", topic: "dependencies", answers: 7 },
        { question: "What is the single most important thing for you to finish this week?", topic: "clarity", answers: 7 },
        { question: "What is slowing you down that nobody has asked about?", topic: "blockers", answers: 6 },
        { question: "Which handoff into your work is least predictable?", topic: "dependencies", answers: 6 },
        { question: "What would you change about how this project runs?", topic: "process", answers: 5 },
      ],
      sentiment_positive_pct: 21,
      sentiment_neutral_pct: 42,
      sentiment_negative_pct: 37,
      created_at: iso(-1, 7),
    },
    {
      id: "sag-ops-w1",
      org_id: ORG,
      scope_type: "department",
      scope_key: "Operations",
      scope_label: "Operations",
      period_start: dateOnly(-7),
      period_end: dateOnly(-1),
      respondent_count: 6,
      response_count: 24,
      invited_count: 6,
      themes: [
        { theme: "Manual reconciliation between two systems", mentionCount: 8, exampleParaphrase: "The same records are being keyed twice because the systems do not talk." },
        { theme: "Approval chains longer than the work itself", mentionCount: 5, exampleParaphrase: "Short tasks are described as waiting days for a one-line approval." },
        { theme: "Reporting requests arriving without notice", mentionCount: 4 },
      ],
      questions_asked: [
        { question: "Which tool slowed you down most this week?", topic: "tooling", answers: 6 },
        { question: "What step in your routine work feels heavier than it should be?", topic: "process", answers: 6 },
        { question: "What access have you had to ask for more than once?", topic: "resources", answers: 6 },
        { question: "How does this week's volume compare with what feels sustainable?", topic: "workload", answers: 6 },
      ],
      sentiment_positive_pct: 29,
      sentiment_neutral_pct: 46,
      sentiment_negative_pct: 25,
      created_at: iso(-1, 7),
    },
    {
      id: "sag-org-w1",
      org_id: ORG,
      scope_type: "org",
      scope_key: ORG,
      scope_label: "Whole company",
      period_start: dateOnly(-7),
      period_end: dateOnly(-1),
      respondent_count: 19,
      response_count: 78,
      invited_count: 22,
      themes: [
        { theme: "Cross-team approvals are the dominant source of delay", mentionCount: 17, exampleParaphrase: "Approvals outside the immediate team are the most frequently named blocker company-wide." },
        { theme: "Duplicate manual entry across systems", mentionCount: 11 },
        { theme: "Ownership unclear at project boundaries", mentionCount: 8 },
        { theme: "Planning assumptions not revisited after scope change", mentionCount: 6 },
      ],
      questions_asked: [
        { question: "What are you waiting on from another team right now?", topic: "dependencies", answers: 19 },
        { question: "What is slowing you down that nobody has asked about?", topic: "blockers", answers: 18 },
        { question: "What would you need to move faster that you do not have today?", topic: "resources", answers: 17 },
      ],
      sentiment_positive_pct: 26,
      sentiment_neutral_pct: 44,
      sentiment_negative_pct: 30,
      created_at: iso(-1, 7),
    },
    {
      id: "sag-vgg-w2",
      org_id: ORG,
      scope_type: "project",
      scope_key: "p-vgg",
      scope_label: "VGG Data Platform",
      period_start: dateOnly(-14),
      period_end: dateOnly(-8),
      respondent_count: 6,
      response_count: 27,
      invited_count: 7,
      themes: [
        { theme: "Waiting on sign-off from outside the team", mentionCount: 5 },
        { theme: "Test data does not reflect production", mentionCount: 5 },
        { theme: "Meeting load crowding out delivery time", mentionCount: 3 },
      ],
      questions_asked: [
        { question: "What are you waiting on from another team right now?", topic: "dependencies", answers: 6 },
        { question: "Is meeting load helping or hurting delivery?", topic: "workload", answers: 6 },
      ],
      sentiment_positive_pct: 30,
      sentiment_neutral_pct: 44,
      sentiment_negative_pct: 26,
      created_at: iso(-8, 7),
    },
  ];

  const dsr_requests: DsrRequest[] = [
    {
      id: "dsr-1",
      org_id: ORG,
      user_id: U.amina,
      type: "access",
      detail: "Please export everything Company OS holds about me.",
      status: "open",
      created_at: iso(-2),
      due_at: iso(28),
      resolved_at: null,
    },
  ];

  const messaging_metrics: MessagingMetrics[] = [
    {
      org_id: ORG,
      meta_tier: "Standard",
      quality_rating: "green",
      send_cap_per_day: 250,
      sends_last_24h: 18,
      opt_out_rate_7d: 0.008,
      block_rate_7d: 0.004,
      opt_in_count: 6,
      updated_at: iso(0, 7),
    },
  ];

  const org_teams: OrgTeam[] = [
    {
      id: "team-eng",
      org_id: ORG,
      name: "Engineering",
      lead_id: U.grace,
      member_ids: [U.grace, U.kayode, U.wanjiru, U.brian],
      created_at: iso(-30),
    },
    {
      id: "team-ops",
      org_id: ORG,
      name: "Ops",
      lead_id: U.alfred,
      member_ids: [U.alfred, U.amina],
      created_at: iso(-30),
    },
  ];

  const auth_sessions: AuthSessionRow[] = [
    {
      id: "sess-alfred-chrome",
      org_id: ORG,
      user_id: U.alfred,
      device: "Chrome · Windows",
      ip: "41.90.x.x",
      created_at: iso(-2),
      last_seen_at: iso(0, 8),
      revoked_at: null,
    },
    {
      id: "sess-alfred-phone",
      org_id: ORG,
      user_id: U.alfred,
      device: "Safari · iPhone",
      ip: "41.90.x.x",
      created_at: iso(-10),
      last_seen_at: iso(-3),
      revoked_at: null,
    },
  ];

  const holidays: TenantHoliday[] = [
    { id: "hol-madaraka", org_id: ORG, date: "2026-06-01", name: "Madaraka Day" },
    { id: "hol-huduma", org_id: ORG, date: "2026-10-10", name: "Huduma Day" },
    { id: "hol-mashujaa", org_id: ORG, date: "2026-10-20", name: "Mashujaa Day" },
    { id: "hol-jamhuri", org_id: ORG, date: "2026-12-12", name: "Jamhuri Day" },
    { id: "hol-xmas", org_id: ORG, date: "2026-12-25", name: "Christmas Day" },
    { id: "hol-boxing", org_id: ORG, date: "2026-12-26", name: "Boxing Day" },
    { id: "hol-ny", org_id: ORG, date: "2027-01-01", name: "New Year's Day" },
  ];

  const ingestion_exclusions: IngestionExclusion[] = [
    {
      id: "ex-salary",
      org_id: ORG,
      scope: "keyword",
      match_value: "salary",
      reason: "HR default",
      created_at: iso(-60),
    },
    {
      id: "ex-disciplinary",
      org_id: ORG,
      scope: "keyword",
      match_value: "disciplinary",
      reason: "HR default",
      created_at: iso(-60),
    },
    {
      id: "ex-1on1",
      org_id: ORG,
      scope: "meeting",
      match_value: "^1:1",
      reason: "Private 1:1s",
      created_at: iso(-45),
    },
    {
      id: "ex-personal",
      org_id: ORG,
      scope: "domain",
      match_value: "gmail.com",
      reason: "Personal mailboxes",
      created_at: iso(-30),
    },
  ];

  const nudge_triggers: NudgeTrigger[] = [
    {
      id: "pre_due",
      org_id: ORG,
      name: "Pre-due check-in",
      precision: 0.82,
      suspended: false,
      sends_7d: 38,
    },
    {
      id: "overdue",
      org_id: ORG,
      name: "Overdue follow-up",
      precision: 0.74,
      suspended: false,
      sends_7d: 21,
    },
    {
      id: "waiting_who",
      org_id: ORG,
      name: "Clarify who holds it",
      precision: 0.61,
      suspended: false,
      sends_7d: 14,
    },
    {
      id: "escalation_nudge",
      org_id: ORG,
      name: "Escalation ping",
      precision: 0.55,
      suspended: true,
      sends_7d: 9,
    },
    {
      id: "daily_pulse",
      org_id: ORG,
      name: "Daily pulse",
      precision: null,
      suspended: false,
      sends_7d: 4,
    },
  ];

  const message_approvals: MessageApproval[] = [
    {
      id: "ma-1",
      org_id: ORG,
      recipient_user_id: U.kayode,
      template_key: "checkin_evidence",
      preview: "Hi Kayode, checking in on *SharePoint migration* — it's due Fri. How's it going?",
      status: "pending",
      created_at: iso(0, 8),
    },
    {
      id: "ma-2",
      org_id: ORG,
      recipient_user_id: U.wanjiru,
      template_key: "unblock_request",
      preview: "Hi Wanjiru — Atlas SSO is waiting on WorkOS callback URLs. Can you unblock?",
      status: "pending",
      created_at: iso(0, 9),
    },
    {
      id: "ma-3",
      org_id: ORG,
      recipient_user_id: U.brian,
      template_key: "waiting_who",
      preview: "Hi Brian — who currently holds the UAT credentials for VGG?",
      status: "approved",
      created_at: iso(-1, 14),
    },
  ];

  return expandSeedHeavy({
    organizations,
    users,
    connections,
    projects,
    meetings,
    commitments,
    checkins,
    escalations,
    ownership_map,
    reports,
    audit_log,
    notifications,
    tags,
    ingestion_label_rules,
    data_access_log,
    commitment_dependencies,
    commitment_feedback,
    commitment_status_history,
    milestones,
    survey_cycles,
    survey_answers,
    daily_survey_cycles,
    daily_survey_questions,
    daily_survey_responses,
    survey_aggregates,
    dsr_requests,
    messaging_metrics,
    org_teams,
    auth_sessions,
    holidays,
    ingestion_exclusions,
    nudge_triggers,
    message_approvals,
  });
}

export const DEMO_USER_ID = U.alfred;
