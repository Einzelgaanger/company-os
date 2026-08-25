# 02 — Data Model

All tables are Postgres 16. Every tenant-scoped table has `tenant_id` immediately after `id`, has RLS enabled and forced, and has `tenant_id` as the leading column of every index.

Conventions: `timestamptz` for all times; `text` + `CHECK` instead of native enums; `gen_random_uuid()` for IDs; soft delete via `deleted_at` on user-facing entities, hard delete only via retention jobs.

---

## 2.1 Control plane (shared, not tenant-scoped)

```sql
-- Tenant registry and routing. Lives in the control-plane DB.
CREATE TABLE tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text UNIQUE NOT NULL,
  isolation_tier        text NOT NULL DEFAULT 'pooled'
                          CHECK (isolation_tier IN ('pooled','silo')),
  region                text NOT NULL DEFAULT 'eu-west-1',
  db_connection_ref     text,                    -- KMS-encrypted ref; NULL when pooled
  plan                  text NOT NULL DEFAULT 'pilot'
                          CHECK (plan IN ('pilot','starter','growth','enterprise')),
  seat_limit            int,
  status                text NOT NULL DEFAULT 'provisioning'
                          CHECK (status IN ('provisioning','active','suspended','offboarding')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Compliance gate. Onboarding cannot complete until every required row is true.
-- See 10_SECURITY_COMPLIANCE.md §10.4.
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
  high_risk_use_prohibited boolean NOT NULL DEFAULT true,   -- C-1. Not settable via UI.
  attested_by_user_id   uuid,
  attested_at           timestamptz
);

-- Global platform config, per tenant.
CREATE TABLE tenant_settings (
  tenant_id             uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  timezone              text NOT NULL DEFAULT 'Africa/Nairobi',
  work_days             int[] NOT NULL DEFAULT '{1,2,3,4,5}',   -- ISO weekday
  quiet_hours_start     time NOT NULL DEFAULT '18:00',
  quiet_hours_end       time NOT NULL DEFAULT '08:00',
  default_escalation_sla_hours int NOT NULL DEFAULT 24,
  checkin_lead_days     int NOT NULL DEFAULT 2,      -- ask BEFORE due date
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

-- Feature flags, per tenant.
CREATE TABLE tenant_flags (
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag                  text NOT NULL,
  enabled               boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, flag)
);
-- Known flags: 'email_ingestion' (gated on CASA, see C-5), 'silo_routing',
-- 'surveys', 'sentiment_aggregate', 'slack_ingestion', 'teams_ingestion'.
```

---

## 2.2 Identity and access

```sql
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  external_id           text,                    -- SCIM externalId; unique per tenant
  email                 text NOT NULL,
  full_name             text NOT NULL,
  display_name          text,
  job_title             text,
  department            text,
  phone_e164            text,
  phone_verified_at     timestamptz,
  whatsapp_opt_in_at    timestamptz,             -- C-6: no opt-in, no message. Ever.
  whatsapp_opt_out_at   timestamptz,
  role                  text NOT NULL DEFAULT 'member'
                          CHECK (role IN ('member','manager','admin','owner')),
  manager_id            uuid REFERENCES users(id),
  status                text NOT NULL DEFAULT 'invited'
                          CHECK (status IN ('invited','active','suspended','deprovisioned')),
  notice_acknowledged_at timestamptz,            -- C-3 transparency notice
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

-- Teams / departments, synced from SCIM groups where available.
CREATE TABLE teams (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  name                  text NOT NULL,
  external_id           text,                    -- SCIM group id
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
  token_hash            text NOT NULL,           -- store hash, never the token
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

-- SSO / SCIM connection state (WorkOS-backed).
CREATE TABLE identity_connections (
  tenant_id             uuid PRIMARY KEY,
  sso_enabled           boolean NOT NULL DEFAULT false,
  sso_connection_id     text,
  sso_domains           text[],
  scim_enabled          boolean NOT NULL DEFAULT false,
  scim_directory_id     text,
  scim_last_sync_at     timestamptz,
  scim_group_role_map   jsonb NOT NULL DEFAULT '{}',   -- {"Engineering Leads":"manager"}
  jit_provisioning      boolean NOT NULL DEFAULT true,
  default_role_on_jit   text NOT NULL DEFAULT 'member'
);
```

---

## 2.3 Work domain

```sql
CREATE TABLE projects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  name                  text NOT NULL,
  code                  text,                    -- short code, e.g. "ATLAS"
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
  progress_pct          numeric(5,2) NOT NULL DEFAULT 0,   -- see 08_REPORTING.md §8.2
  progress_computed_at  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX projects_tenant_status ON projects(tenant_id, status);
CREATE INDEX projects_tenant_owner ON projects(tenant_id, owner_user_id);

-- Milestones give projects a weightable structure for progress %.
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

-- THE CORE OBJECT.
CREATE TABLE commitments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  project_id            uuid REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id          uuid REFERENCES milestones(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text,

  -- Ownership. owner_user_id OR owner_external is set, never neither.
  owner_user_id         uuid REFERENCES users(id),
  owner_external_name   text,
  owner_external_email  text,
  owner_confidence      numeric(3,2),            -- extraction match confidence 0..1
  requested_by_user_id  uuid REFERENCES users(id),

  -- Provenance. Always traceable to a source.
  source_type           text NOT NULL
                          CHECK (source_type IN ('meeting','email','manual','whatsapp','calendar','import')),
  source_id             uuid,                    -- meetings.id / messages.id etc.
  source_excerpt        text,                    -- short quote for the UI; sanitized
  extraction_run_id     uuid,

  due_date              date,
  due_date_source       text CHECK (due_date_source IN ('stated','inferred','manual','none')),
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_progress','blocked','at_risk','overdue','escalated','done','cancelled')),
  priority              text NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low','medium','high','critical')),
  progress_pct          numeric(5,2) NOT NULL DEFAULT 0,   -- self-reported, see 08 §8.2

  review_required       boolean NOT NULL DEFAULT false,    -- low-confidence extraction
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

-- Immutable event log per commitment. Drives the timeline UI and the audit story.
CREATE TABLE commitment_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  commitment_id         uuid NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  event_type            text NOT NULL,           -- created|status_changed|checkin_sent|reply_received|
                                                 -- escalated|reassigned|due_changed|resolved|reviewed
  actor                 text NOT NULL,           -- 'system' | user_id
  from_value            text,
  to_value              text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commitment_events_tenant_commitment ON commitment_events(tenant_id, commitment_id, created_at DESC);
```

---

## 2.4 Ingestion sources

```sql
CREATE TABLE connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  user_id               uuid REFERENCES users(id),      -- NULL = org-level connection
  provider              text NOT NULL
                          CHECK (provider IN ('google_calendar','microsoft_calendar','gmail','outlook',
                                              'google_drive','onedrive','fathom','zoom','teams','slack')),
  status                text NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('connected','disconnected','error','expired','revoked')),
  scopes                text[] NOT NULL DEFAULT '{}',
  external_account      text,
  access_token_enc      bytea,                   -- KMS envelope encrypted. NEVER returned by any API.
  refresh_token_enc     bytea,
  token_expires_at      timestamptz,
  connected_at          timestamptz,
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX connections_tenant_user_provider
  ON connections(tenant_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), provider);

-- Governance exclusions. Configured per tenant BEFORE ingestion starts. See 04_INTEGRATIONS.md §4.5.
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
  participants          jsonb NOT NULL DEFAULT '[]',  -- [{email,name,user_id|null,is_external}]
  has_external_participants boolean NOT NULL DEFAULT false,
  transcript_ref        text,                    -- S3 key. Text only; audio is never stored. (C-2)
  transcript_sha256     text,
  project_id            uuid REFERENCES projects(id),
  project_link_method   text CHECK (project_link_method IN ('auto','manual','none')),
  visibility_user_ids   uuid[] NOT NULL DEFAULT '{}',  -- C-1/governance: who may see derived items
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

-- Email/chat source records. Body is NOT stored long-term; see retention in 10 §10.6.
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
  body_ref              text,                    -- S3 key, purged after extraction + grace period
  body_purged_at        timestamptz,
  visibility_user_ids   uuid[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'ingested'
                          CHECK (status IN ('ingested','excluded','processing','processed','failed')),
  excluded_by_rule_id   uuid REFERENCES ingestion_exclusions(id),
  processed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX source_messages_tenant_external ON source_messages(tenant_id, provider, external_id);
```

---

## 2.5 Messaging

```sql
-- Registry of Meta-approved templates. No send may reference an unregistered template. (C-6)
CREATE TABLE message_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key          text UNIQUE NOT NULL,    -- e.g. 'checkin_pre_due'
  meta_template_name    text NOT NULL,
  category              text NOT NULL CHECK (category IN ('utility','authentication','marketing')),
  language              text NOT NULL DEFAULT 'en',
  body                  text NOT NULL,           -- with {{1}}, {{2}} placeholders
  variable_map          jsonb NOT NULL,          -- {"1":"first_name","2":"commitment_title"}
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
  service_window_expires_at timestamptz,         -- C-6: free-form only while open
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
  intent                text,                    -- checkin_pre_due|followup|escalation|survey|clarify|confirm
  provider_message_id   text,
  delivery_status       text CHECK (delivery_status IN ('queued','sent','delivered','read','failed','undelivered')),
  failure_reason        text,

  -- Inbound classification output (fast model). See 05_AI_PIPELINE.md §5.5.
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

-- Per-tenant WhatsApp send accounting, for tier and quality management. (C-6)
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
```

---

## 2.6 Escalation

```sql
CREATE TABLE ownership_map (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  category              text NOT NULL,           -- 'data requests','engineering blockers','client deliverables'
  match_keywords        text[] NOT NULL DEFAULT '{}',
  project_id            uuid REFERENCES projects(id),   -- optional narrower scope
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
  context_snapshot      jsonb NOT NULL,          -- frozen: commitment + last 3 exchanges + source excerpt
  level                 int NOT NULL DEFAULT 1,  -- 1 = primary, 2 = backup, 3 = admin
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','acknowledged','resolved','expired')),
  acknowledged_at       timestamptz,
  resolved_at           timestamptz,
  resolution_note       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX escalations_tenant_status ON escalations(tenant_id, status, created_at DESC);
```

---

## 2.7 Surveys and aggregate sentiment

See `07_SURVEYS_SENTIMENT.md` for the legal guardrails these tables implement.

```sql
CREATE TABLE survey_cycles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  theme                 text,                    -- AI-chosen focus for this cycle
  generation_rationale  text,                    -- why these questions, for transparency
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','sending','collecting','aggregating','closed','suppressed')),
  invited_count         int NOT NULL DEFAULT 0,
  responded_count       int NOT NULL DEFAULT 0,
  min_n_met             boolean NOT NULL DEFAULT false,   -- C-2: >= 5 respondents
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
  topic                 text NOT NULL,           -- 'blockers','process','resources','clarity','workload'
  generated_by          text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','admin','template')),
  approved_by_user_id   uuid REFERENCES users(id),
  approved_at           timestamptz
);
CREATE INDEX survey_questions_tenant_cycle ON survey_questions(tenant_id, cycle_id, sort_order);

-- Individual responses. Purged to aggregate after the cycle closes. (C-2)
CREATE TABLE survey_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  cycle_id              uuid NOT NULL REFERENCES survey_cycles(id) ON DELETE CASCADE,
  question_id           uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  respondent_hash       text NOT NULL,           -- HMAC(user_id, cycle_salt). Not reversible outside the cycle.
  answer_scale          int,
  answer_bool           boolean,
  answer_text           text,
  sentiment_label       text CHECK (sentiment_label IN ('positive','neutral','negative')),
  sentiment_purged_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_responses_tenant_cycle ON survey_responses(tenant_id, cycle_id);
-- NOTE: there is deliberately NO index or foreign key on user_id here. Do not add one.

-- Aggregated output. This is the ONLY thing surfaced in reports or the UI.
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
  themes                jsonb NOT NULL DEFAULT '[]',  -- [{theme, mention_count, example_paraphrase}]
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT min_n CHECK (respondent_count >= 5)      -- C-2, enforced by the database
);
```

---

## 2.8 Reporting

```sql
CREATE TABLE reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  type                  text NOT NULL CHECK (type IN ('weekly','daily')),
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  content_json          jsonb NOT NULL,          -- structured data behind the report
  content_html          text,
  pdf_ref               text,                    -- S3 key
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
  email                 text,                    -- for non-user recipients (e.g. a board member)
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
```

---

## 2.9 AI operations and audit

```sql
-- Every LLM call. Drives cost attribution, quality monitoring, and AI Act Art.12 logging.
CREATE TABLE ai_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  task                  text NOT NULL,           -- extract_commitments|classify_reply|generate_survey|
                                                 -- summarize_themes|compose_report
  model                 text NOT NULL,
  tier                  text NOT NULL CHECK (tier IN ('fast','standard','deep')),
  input_tokens          int NOT NULL DEFAULT 0,
  output_tokens         int NOT NULL DEFAULT 0,
  cached_tokens         int NOT NULL DEFAULT 0,
  cost_usd              numeric(10,6) NOT NULL DEFAULT 0,
  latency_ms            int,
  source_type           text,
  source_id             uuid,
  output_valid          boolean,                 -- passed schema validation
  validation_errors     jsonb,
  escalated_to_tier     text,                    -- set when a fast-tier result was re-run deeper
  sampled_for_qa        boolean NOT NULL DEFAULT false,
  qa_agreement          boolean,
  prompt_version        text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_runs_tenant_created ON ai_runs(tenant_id, created_at DESC);
CREATE INDEX ai_runs_tenant_task ON ai_runs(tenant_id, task, created_at DESC);

-- Prompt-injection detections. Every one is a security event.
CREATE TABLE injection_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  source_type           text NOT NULL,
  source_id             uuid,
  detection             text NOT NULL,           -- schema_violation|instruction_pattern|
                                                 -- unresolvable_recipient|url_in_output|excess_length
  raw_excerpt_ref       text,                    -- S3 key, restricted access
  action_taken          text NOT NULL,           -- quarantined|dropped|flagged_for_review
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id                    bigserial PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  actor_type            text NOT NULL CHECK (actor_type IN ('user','system','scim','admin_support')),
  actor_id              text,
  action                text NOT NULL,           -- dotted: user.role_changed, connection.revoked,
                                                 -- escalation.created, report.viewed, data.exported
  target_type           text,
  target_id             uuid,
  ip_address            inet,
  user_agent            text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX audit_log_tenant_action ON audit_log(tenant_id, action, created_at DESC);

-- Data subject requests (GDPR Art.15/17, Kenya DPA equivalents). See 10 §10.7.
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
  due_at                timestamptz NOT NULL,    -- created_at + 30 days
  completed_at          timestamptz
);
```

---

## 2.10 RLS application

Apply to **every** table carrying `tenant_id`:

```sql
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'tenant_id' AND table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;
```

Role-level restrictions (member vs manager vs admin) are enforced in the **API authorization layer**, not RLS. RLS is the tenant boundary only — one concern per mechanism. The authorization matrix is in `03_IDENTITY_ACCESS.md` §3.2.

A migration that adds a `tenant_id` column without adding the policy must fail CI. Add a test that enumerates all tables with `tenant_id` and asserts each has RLS enabled, forced, and a policy.
