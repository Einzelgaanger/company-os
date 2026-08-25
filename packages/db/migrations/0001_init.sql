-- Loop Enterprise — 0001_init
-- Schema from 02_DATA_MODEL.md + RLS tenant isolation (01_ARCHITECTURE §1.3).
--
-- ROLE NOTE:
--   Migrations run as the table owner (e.g. loop_owner / postgres).
--   The application MUST connect as a dedicated non-owner role `loop_app`
--   that has NO BYPASSRLS. Table owners and superusers bypass RLS (footgun #1).
--
--   Example (run once as superuser):
--     CREATE ROLE loop_app LOGIN PASSWORD '...';
--     GRANT CONNECT ON DATABASE loop TO loop_app;
--     GRANT USAGE ON SCHEMA public TO loop_app;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loop_app;
--     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loop_app;
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loop_app;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Control plane ───────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text,
  isolation_tier        text NOT NULL DEFAULT 'pooled'
                          CHECK (isolation_tier IN ('pooled','silo')),
  region                text,
  db_connection_ref     text,
  plan                  text NOT NULL DEFAULT 'pilot'
                          CHECK (plan IN ('pilot','starter','growth','enterprise')),
  seat_limit            int,
  status                text NOT NULL DEFAULT 'provisioning'
                          CHECK (status IN ('provisioning','active','suspended','offboarding')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_compliance (
  tenant_id             uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  lawful_basis          text NOT NULL DEFAULT 'legitimate_interest'
                          CHECK (lawful_basis IN ('legitimate_interest','contract','legal_obligation')),
  dpia_completed        boolean NOT NULL DEFAULT false,
  dpia_completed_at     timestamptz,
  dpia_document_url     text,
  lia_completed         boolean NOT NULL DEFAULT false,
  works_council_required boolean NOT NULL DEFAULT false,
  works_council_consulted boolean NOT NULL DEFAULT false,
  employee_notice_published boolean NOT NULL DEFAULT false,
  employee_notice_version text,
  dpo_name              text,
  dpo_email             text,
  data_residency_region text,
  high_risk_use_prohibited boolean NOT NULL DEFAULT true,
  attested_by_user_id   uuid,
  attested_at           timestamptz
);

CREATE TABLE tenant_settings (
  tenant_id             uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  timezone              text NOT NULL DEFAULT 'Africa/Nairobi',
  work_days             int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  quiet_hours_start     time NOT NULL DEFAULT '18:00',
  quiet_hours_end       time NOT NULL DEFAULT '08:00',
  default_escalation_sla_hours int NOT NULL DEFAULT 24,
  checkin_lead_days     int NOT NULL DEFAULT 2,
  max_checkins_per_person_per_day int NOT NULL DEFAULT 3,
  report_frequency      text NOT NULL DEFAULT 'weekly'
                          CHECK (report_frequency IN ('weekly','daily_and_weekly')),
  report_day_of_week    int NOT NULL DEFAULT 1,
  report_send_hour      int NOT NULL DEFAULT 8,
  survey_enabled        boolean NOT NULL DEFAULT true,
  survey_frequency      text NOT NULL DEFAULT 'weekly'
                          CHECK (survey_frequency IN ('weekly','biweekly','monthly','off')),
  retention_months_messages int NOT NULL DEFAULT 12,
  retention_months_transcripts int NOT NULL DEFAULT 12,
  retention_months_audit int NOT NULL DEFAULT 24
);

CREATE TABLE tenant_flags (
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag                  text NOT NULL,
  enabled               boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, flag)
);

-- ─── Identity ────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  external_id           text,
  email                 text NOT NULL,
  full_name             text NOT NULL,
  display_name          text,
  job_title             text,
  department            text,
  phone_e164            text,
  phone_verified_at     timestamptz,
  whatsapp_opt_in_at    timestamptz,
  whatsapp_opt_out_at   timestamptz,
  role                  text NOT NULL DEFAULT 'member'
                          CHECK (role IN ('member','manager','admin','owner')),
  manager_id            uuid REFERENCES users(id),
  status                text NOT NULL DEFAULT 'invited'
                          CHECK (status IN ('invited','active','suspended','deprovisioned')),
  notice_acknowledged_at timestamptz,
  notice_version        text,
  locale                text NOT NULL DEFAULT 'en',
  avatar_url            text,
  last_active_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE UNIQUE INDEX users_tenant_email ON users(tenant_id, lower(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_tenant_external ON users(tenant_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX users_tenant_manager ON users(tenant_id, manager_id);
CREATE INDEX users_tenant_status ON users(tenant_id, status);

CREATE TABLE teams (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  name                  text NOT NULL,
  external_id           text,
  lead_user_id          uuid REFERENCES users(id),
  parent_team_id        uuid REFERENCES teams(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teams_tenant ON teams(tenant_id);

CREATE TABLE team_members (
  tenant_id             uuid NOT NULL,
  team_id               uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, team_id, user_id)
);

CREATE TABLE invites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  email                 text NOT NULL,
  role                  text NOT NULL CHECK (role IN ('member','manager','admin')),
  team_id               uuid REFERENCES teams(id),
  manager_id            uuid REFERENCES users(id),
  token_hash            text NOT NULL,
  invited_by_user_id    uuid NOT NULL REFERENCES users(id),
  expires_at            timestamptz NOT NULL,
  accepted_at           timestamptz,
  revoked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_tenant_email ON invites(tenant_id, lower(email));

CREATE TABLE sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash    text NOT NULL,
  ip_address            inet,
  user_agent            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  revoked_at            timestamptz
);
CREATE INDEX sessions_tenant_user ON sessions(tenant_id, user_id);

CREATE TABLE identity_connections (
  tenant_id             uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  sso_enabled           boolean NOT NULL DEFAULT false,
  sso_connection_id     text,
  sso_domains           text[],
  scim_enabled          boolean NOT NULL DEFAULT false,
  scim_directory_id     text,
  scim_last_sync_at     timestamptz,
  scim_group_role_map   jsonb NOT NULL DEFAULT '{}',
  jit_provisioning      boolean NOT NULL DEFAULT true,
  default_role_on_jit   text NOT NULL DEFAULT 'member'
);

-- ─── Work ────────────────────────────────────────────────────────────────────

CREATE TABLE projects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  name                  text NOT NULL,
  code                  text,
  description           text,
  client_name           text,
  owner_user_id         uuid REFERENCES users(id),
  team_id               uuid REFERENCES teams(id),
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('planning','active','on_hold','completed','archived')),
  start_date            date,
  target_end_date       date,
  actual_end_date       date,
  health                text NOT NULL DEFAULT 'unknown'
                          CHECK (health IN ('on_track','at_risk','off_track','unknown')),
  health_computed_at    timestamptz,
  progress_pct          numeric(5,2) NOT NULL DEFAULT 0,
  progress_computed_at  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX projects_tenant_status ON projects(tenant_id, status);
CREATE INDEX projects_tenant_owner ON projects(tenant_id, owner_user_id);

CREATE TABLE milestones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  weight                numeric(5,2) NOT NULL DEFAULT 1,
  due_date              date,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_progress','done','cancelled')),
  completed_at          timestamptz,
  sort_order            int NOT NULL DEFAULT 0
);
CREATE INDEX milestones_tenant_project ON milestones(tenant_id, project_id);

CREATE TABLE commitments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  project_id            uuid REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id          uuid REFERENCES milestones(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text,
  owner_user_id         uuid REFERENCES users(id),
  owner_external_name   text,
  owner_external_email  text,
  owner_confidence      numeric(3,2),
  requested_by_user_id  uuid REFERENCES users(id),
  source_type           text NOT NULL
                          CHECK (source_type IN ('meeting','email','manual','whatsapp','calendar','import')),
  source_id             uuid,
  source_excerpt        text,
  extraction_run_id     uuid,
  due_date              date,
  due_date_source       text CHECK (due_date_source IN ('stated','inferred','manual','none')),
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_progress','blocked','at_risk','overdue','escalated','done','cancelled')),
  priority              text NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low','medium','high','critical')),
  progress_pct          numeric(5,2) NOT NULL DEFAULT 0,
  review_required       boolean NOT NULL DEFAULT false,
  review_reason         text,
  last_checkin_at       timestamptz,
  last_response_at      timestamptz,
  next_checkin_at       timestamptz,
  blocked_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  deleted_at            timestamptz,
  CONSTRAINT owner_present CHECK (owner_user_id IS NOT NULL OR owner_external_name IS NOT NULL)
);
CREATE INDEX commitments_tenant_status ON commitments(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX commitments_tenant_owner ON commitments(tenant_id, owner_user_id, status);
CREATE INDEX commitments_tenant_project ON commitments(tenant_id, project_id);
CREATE INDEX commitments_tenant_next_checkin ON commitments(tenant_id, next_checkin_at)
  WHERE status NOT IN ('done','cancelled') AND deleted_at IS NULL;
CREATE INDEX commitments_tenant_due ON commitments(tenant_id, due_date)
  WHERE status NOT IN ('done','cancelled');

CREATE TABLE commitment_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  commitment_id         uuid NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  event_type            text NOT NULL,
  actor                 text NOT NULL,
  from_value            text,
  to_value              text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commitment_events_tenant_commitment ON commitment_events(tenant_id, commitment_id, created_at DESC);

-- ─── Ingestion ───────────────────────────────────────────────────────────────

CREATE TABLE connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  user_id               uuid REFERENCES users(id),
  provider              text NOT NULL
                          CHECK (provider IN ('google_calendar','microsoft_calendar','gmail','outlook',
                                              'google_drive','onedrive','fathom','zoom','teams','slack')),
  status                text NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('connected','disconnected','error','expired','revoked')),
  scopes                text[] NOT NULL DEFAULT '{}',
  external_account      text,
  access_token_enc      bytea,
  refresh_token_enc     bytea,
  token_expires_at      timestamptz,
  connected_at          timestamptz,
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX connections_tenant_user_provider
  ON connections(tenant_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), provider);

CREATE TABLE ingestion_exclusions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  rule_type             text NOT NULL
                          CHECK (rule_type IN ('domain','email_address','keyword','label','calendar_id',
                                               'channel','user','team','meeting_title_pattern')),
  value                 text NOT NULL,
  scope                 text NOT NULL DEFAULT 'all'
                          CHECK (scope IN ('all','email','calendar','meetings','files','chat')),
  reason                text,
  created_by_user_id    uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingestion_exclusions_tenant ON ingestion_exclusions(tenant_id, scope);

CREATE TABLE meetings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  provider              text NOT NULL,
  external_id           text NOT NULL,
  title                 text,
  occurred_at           timestamptz,
  duration_seconds      int,
  organizer_email       text,
  participants          jsonb NOT NULL DEFAULT '[]',
  has_external_participants boolean NOT NULL DEFAULT false,
  transcript_ref        text,
  transcript_sha256     text,
  project_id            uuid REFERENCES projects(id),
  project_link_method   text CHECK (project_link_method IN ('auto','manual','none')),
  visibility_user_ids   uuid[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'ingested'
                          CHECK (status IN ('ingested','excluded','processing','processed','failed','needs_review')),
  excluded_by_rule_id   uuid REFERENCES ingestion_exclusions(id),
  processed_at          timestamptz,
  commitments_extracted int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX meetings_tenant_external ON meetings(tenant_id, provider, external_id);
CREATE INDEX meetings_tenant_occurred ON meetings(tenant_id, occurred_at DESC);
CREATE INDEX meetings_tenant_status ON meetings(tenant_id, status);

CREATE TABLE source_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  provider              text NOT NULL,
  external_id           text NOT NULL,
  thread_external_id    text,
  subject               text,
  from_email            text,
  to_emails             text[],
  cc_emails             text[],
  sent_at               timestamptz,
  body_ref              text,
  body_purged_at        timestamptz,
  visibility_user_ids   uuid[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'ingested'
                          CHECK (status IN ('ingested','excluded','processing','processed','failed')),
  excluded_by_rule_id   uuid REFERENCES ingestion_exclusions(id),
  processed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX source_messages_tenant_external ON source_messages(tenant_id, provider, external_id);

-- ─── Messaging ───────────────────────────────────────────────────────────────

CREATE TABLE message_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key          text UNIQUE NOT NULL,
  meta_template_name    text NOT NULL,
  category              text NOT NULL CHECK (category IN ('utility','authentication','marketing')),
  language              text NOT NULL DEFAULT 'en',
  body                  text NOT NULL,
  variable_map          jsonb NOT NULL,
  meta_status           text NOT NULL DEFAULT 'pending'
                          CHECK (meta_status IN ('pending','approved','rejected','paused','disabled')),
  approved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  user_id               uuid NOT NULL REFERENCES users(id),
  channel               text NOT NULL DEFAULT 'whatsapp',
  service_window_expires_at timestamptz,
  last_inbound_at       timestamptz,
  last_outbound_at      timestamptz,
  state                 text NOT NULL DEFAULT 'idle'
                          CHECK (state IN ('idle','awaiting_reply','awaiting_clarification','in_survey')),
  state_context         jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_tenant_user_channel ON conversations(tenant_id, user_id, channel);

CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  conversation_id       uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  commitment_id         uuid REFERENCES commitments(id) ON DELETE SET NULL,
  survey_instance_id    uuid,
  direction             text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel               text NOT NULL DEFAULT 'whatsapp',
  template_key          text REFERENCES message_templates(template_key),
  body                  text NOT NULL,
  intent                text,
  provider_message_id   text,
  delivery_status       text CHECK (delivery_status IN ('queued','sent','delivered','read','failed','undelivered')),
  failure_reason        text,
  parsed_status         text CHECK (parsed_status IN ('on_track','in_progress','blocked','done','not_started','unclear','opt_out')),
  parsed_progress_pct   numeric(5,2),
  parsed_blocker        text,
  parsed_needs          text,
  parsed_confidence     numeric(3,2),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_tenant_conversation ON messages(tenant_id, conversation_id, created_at DESC);
CREATE INDEX messages_tenant_commitment ON messages(tenant_id, commitment_id);
CREATE UNIQUE INDEX messages_tenant_provider_id ON messages(tenant_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE messaging_quota (
  tenant_id             uuid NOT NULL,
  window_date           date NOT NULL,
  unique_contacts       int NOT NULL DEFAULT 0,
  messages_sent         int NOT NULL DEFAULT 0,
  messages_failed       int NOT NULL DEFAULT 0,
  opt_outs              int NOT NULL DEFAULT 0,
  blocks                int NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, window_date)
);

-- ─── Escalation ──────────────────────────────────────────────────────────────

CREATE TABLE ownership_map (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  category              text NOT NULL,
  match_keywords        text[] NOT NULL DEFAULT '{}',
  project_id            uuid REFERENCES projects(id),
  team_id               uuid REFERENCES teams(id),
  primary_owner_user_id uuid NOT NULL REFERENCES users(id),
  backup_owner_user_id  uuid REFERENCES users(id),
  sla_hours             int NOT NULL DEFAULT 24,
  sort_order            int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ownership_map_tenant ON ownership_map(tenant_id, sort_order);

CREATE TABLE escalations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  commitment_id         uuid NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  escalated_to_user_id  uuid NOT NULL REFERENCES users(id),
  routed_by             text NOT NULL
                          CHECK (routed_by IN ('ownership_map','manager_fallback','admin_fallback','manual')),
  ownership_map_id      uuid REFERENCES ownership_map(id),
  trigger               text NOT NULL
                          CHECK (trigger IN ('blocker_reported','no_response','past_due','manual')),
  reason                text NOT NULL,
  context_snapshot      jsonb NOT NULL,
  level                 int NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','acknowledged','resolved','expired')),
  acknowledged_at       timestamptz,
  resolved_at           timestamptz,
  resolution_note       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX escalations_tenant_status ON escalations(tenant_id, status, created_at DESC);

-- ─── Surveys (C-2) ───────────────────────────────────────────────────────────

CREATE TABLE survey_cycles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  theme                 text,
  generation_rationale  text,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','sending','collecting','aggregating','closed','suppressed')),
  invited_count         int NOT NULL DEFAULT 0,
  responded_count       int NOT NULL DEFAULT 0,
  min_n_met             boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz
);
CREATE INDEX survey_cycles_tenant_period ON survey_cycles(tenant_id, period_start DESC);

CREATE TABLE survey_questions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  cycle_id              uuid NOT NULL REFERENCES survey_cycles(id) ON DELETE CASCADE,
  sort_order            int NOT NULL,
  question_text         text NOT NULL,
  question_type         text NOT NULL CHECK (question_type IN ('scale_1_5','open_text','yes_no','multi_choice')),
  options               jsonb,
  topic                 text NOT NULL,
  generated_by          text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','admin','template')),
  approved_by_user_id   uuid REFERENCES users(id),
  approved_at           timestamptz
);
CREATE INDEX survey_questions_tenant_cycle ON survey_questions(tenant_id, cycle_id, sort_order);

-- Deliberately NO user_id column or FK (C-2).
CREATE TABLE survey_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  cycle_id              uuid NOT NULL REFERENCES survey_cycles(id) ON DELETE CASCADE,
  question_id           uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  respondent_hash       text NOT NULL,
  answer_scale          int,
  answer_bool           boolean,
  answer_text           text,
  sentiment_label       text CHECK (sentiment_label IN ('positive','neutral','negative')),
  sentiment_purged_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_responses_tenant_cycle ON survey_responses(tenant_id, cycle_id);

CREATE TABLE survey_aggregates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  cycle_id              uuid NOT NULL REFERENCES survey_cycles(id) ON DELETE CASCADE,
  scope                 text NOT NULL DEFAULT 'org' CHECK (scope IN ('org','team','project')),
  scope_id              uuid,
  respondent_count      int NOT NULL,
  avg_scale             numeric(4,2),
  sentiment_positive_pct numeric(5,2),
  sentiment_neutral_pct numeric(5,2),
  sentiment_negative_pct numeric(5,2),
  themes                jsonb NOT NULL DEFAULT '[]',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT min_n CHECK (respondent_count >= 5)
);

-- ─── Reporting ───────────────────────────────────────────────────────────────

CREATE TABLE reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  type                  text NOT NULL CHECK (type IN ('weekly','daily')),
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  content_json          jsonb NOT NULL,
  content_html          text,
  pdf_ref               text,
  pdf_sha256            text,
  status                text NOT NULL DEFAULT 'generating'
                          CHECK (status IN ('generating','ready','sending','sent','failed')),
  generated_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reports_tenant_type_period ON reports(tenant_id, type, period_start);

CREATE TABLE report_recipients (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  user_id               uuid REFERENCES users(id),
  email                 text,
  report_type           text NOT NULL CHECK (report_type IN ('weekly','daily')),
  scope                 text NOT NULL DEFAULT 'org' CHECK (scope IN ('org','team','project')),
  scope_id              uuid,
  active                boolean NOT NULL DEFAULT true,
  CONSTRAINT recipient_target CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX report_recipients_tenant ON report_recipients(tenant_id, report_type) WHERE active;

CREATE TABLE report_deliveries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  report_id             uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  recipient_email       text NOT NULL,
  channel               text NOT NULL DEFAULT 'email',
  provider_message_id   text,
  status                text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','sent','delivered','bounced','failed')),
  sent_at               timestamptz,
  opened_at             timestamptz
);

-- ─── AI + audit ──────────────────────────────────────────────────────────────

CREATE TABLE ai_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  task                  text NOT NULL,
  model                 text NOT NULL,
  tier                  text NOT NULL CHECK (tier IN ('fast','standard','deep')),
  input_tokens          int NOT NULL DEFAULT 0,
  output_tokens         int NOT NULL DEFAULT 0,
  cached_tokens         int NOT NULL DEFAULT 0,
  cost_usd              numeric(10,6) NOT NULL DEFAULT 0,
  latency_ms            int,
  source_type           text,
  source_id             uuid,
  output_valid          boolean,
  validation_errors     jsonb,
  escalated_to_tier     text,
  sampled_for_qa        boolean NOT NULL DEFAULT false,
  qa_agreement          boolean,
  prompt_version        text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_runs_tenant_created ON ai_runs(tenant_id, created_at DESC);
CREATE INDEX ai_runs_tenant_task ON ai_runs(tenant_id, task, created_at DESC);

CREATE TABLE injection_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  source_type           text NOT NULL,
  source_id             uuid,
  detection             text NOT NULL,
  raw_excerpt_ref       text,
  action_taken          text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id                    bigserial PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  actor_type            text NOT NULL CHECK (actor_type IN ('user','system','scim','admin_support')),
  actor_id              text,
  action                text NOT NULL,
  target_type           text,
  target_id             uuid,
  ip_address            inet,
  user_agent            text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX audit_log_tenant_action ON audit_log(tenant_id, action, created_at DESC);

CREATE TABLE dsr_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  user_id               uuid NOT NULL REFERENCES users(id),
  request_type          text NOT NULL CHECK (request_type IN ('access','erasure','rectification','objection')),
  status                text NOT NULL DEFAULT 'received'
                          CHECK (status IN ('received','in_progress','completed','rejected')),
  export_ref            text,
  handled_by_user_id    uuid REFERENCES users(id),
  rejection_reason      text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  due_at                timestamptz NOT NULL,
  completed_at          timestamptz
);

-- ─── RLS: enable + FORCE + tenant_isolation on every tenant_id table ─────────
-- Role-level auth is in the API can() layer; RLS is the tenant boundary only.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
      )
      WITH CHECK (
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
      )
    $f$, t);
  END LOOP;
END $$;
