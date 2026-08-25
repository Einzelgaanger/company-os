-- Loop — core schema (BUILD_SPEC Section 3)
-- All tables are org-scoped and RLS-protected (see 0002_rls.sql).

create extension if not exists "pgcrypto";

-- ORGANIZATIONS ------------------------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  plan        text not null default 'pilot',
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- USERS (extends auth.users) ----------------------------------------------
create table if not exists users (
  id                 uuid primary key references auth.users(id) on delete cascade,
  org_id             uuid not null references organizations(id) on delete cascade,
  full_name          text not null,
  email              text not null,
  phone_number       text,
  phone_verified_at  timestamptz,
  role               text not null default 'member' check (role in ('owner','admin','manager','member')),
  manager_id         uuid references users(id) on delete set null,
  status             text not null default 'invited' check (status in ('invited','active','disabled')),
  avatar_url         text,
  notification_prefs jsonb not null default '{"whatsapp_checkins": true}',
  created_at         timestamptz not null default now(),
  last_active_at     timestamptz
);
create index if not exists users_org_idx on users(org_id);
create index if not exists users_manager_idx on users(manager_id);

-- CONNECTIONS --------------------------------------------------------------
create table if not exists connections (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,
  user_id                uuid references users(id) on delete cascade,
  provider               text not null,
  status                 text not null default 'disconnected' check (status in ('connected','disconnected','error','expired')),
  access_token           text,   -- encrypted at rest via Supabase Vault; never returned to client
  refresh_token          text,   -- encrypted at rest via Supabase Vault; never returned to client
  scopes                 text[],
  external_account_email text,
  connected_at           timestamptz,
  last_synced_at         timestamptz,
  error_message          text
);
create index if not exists connections_org_idx on connections(org_id);

-- PROJECTS -----------------------------------------------------------------
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  description text,
  client_name text,
  status      text not null default 'active' check (status in ('active','on_hold','completed','archived')),
  owner_id    uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists projects_org_idx on projects(org_id);

-- MEETINGS -----------------------------------------------------------------
create table if not exists meetings (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references organizations(id) on delete cascade,
  source                      text not null check (source in ('fathom','zoom','teams','manual')),
  external_id                 text,
  title                       text,
  participants                jsonb not null default '[]',
  transcript_url              text,
  recording_url               text,
  occurred_at                 timestamptz,
  ingested_at                 timestamptz not null default now(),
  processed_at                timestamptz,
  extracted_commitments_count int not null default 0,
  unique (org_id, source, external_id)
);
create index if not exists meetings_org_idx on meetings(org_id);

-- COMMITMENTS --------------------------------------------------------------
create table if not exists commitments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  project_id          uuid references projects(id) on delete set null,
  title               text not null,
  description         text,
  owner_id            uuid references users(id) on delete set null,
  owner_external_name text,
  requested_by_id     uuid references users(id) on delete set null,
  source_type         text not null check (source_type in ('meeting','email','manual','whatsapp')),
  source_meeting_id   uuid references meetings(id) on delete set null,
  due_date            date,
  status              text not null default 'open' check (status in ('open','in_progress','at_risk','overdue','escalated','done')),
  priority            text not null default 'medium' check (priority in ('low','medium','high','critical')),
  last_checkin_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
create index if not exists commitments_org_idx on commitments(org_id);
create index if not exists commitments_owner_idx on commitments(owner_id);
create index if not exists commitments_project_idx on commitments(project_id);

-- CHECKINS -----------------------------------------------------------------
create table if not exists checkins (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  commitment_id uuid references commitments(id) on delete set null,
  direction     text not null check (direction in ('outbound','inbound')),
  channel       text not null default 'whatsapp',
  message_type  text not null,
  message_text  text not null,
  parsed_status text check (parsed_status in ('on_track','blocked','done','unclear')),
  parsed_blocker text,
  twilio_sid    text unique,
  created_at    timestamptz not null default now()
);
create index if not exists checkins_org_idx on checkins(org_id);
create index if not exists checkins_commitment_idx on checkins(commitment_id);

-- ESCALATIONS --------------------------------------------------------------
create table if not exists escalations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  commitment_id    uuid not null references commitments(id) on delete cascade,
  escalated_to_id  uuid not null references users(id) on delete cascade,
  reason           text not null,
  context_snapshot jsonb not null,
  status           text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at       timestamptz not null default now(),
  acknowledged_at  timestamptz,
  resolved_at      timestamptz
);
create index if not exists escalations_org_idx on escalations(org_id);

-- OWNERSHIP MAP ------------------------------------------------------------
create table if not exists ownership_map (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  category         text not null,
  primary_owner_id uuid not null references users(id) on delete cascade,
  backup_owner_id  uuid references users(id) on delete set null,
  sla_hours        int not null default 24
);
create index if not exists ownership_map_org_idx on ownership_map(org_id);

-- REPORTS ------------------------------------------------------------------
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  type          text not null check (type in ('daily','weekly')),
  period_start  date not null,
  period_end    date not null,
  content_md    text not null,
  content_json  jsonb not null,
  recipient_ids uuid[] not null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists reports_org_idx on reports(org_id);

-- AUDIT LOG ----------------------------------------------------------------
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  actor       text not null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_org_idx on audit_log(org_id);

-- NOTIFICATIONS (in-app center, IA route /notifications) -------------------
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('escalation','report','connection_error','system')),
  title      text not null,
  body       text not null,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id);

-- keep commitments.updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists commitments_updated_at on commitments;
create trigger commitments_updated_at before update on commitments
  for each row execute function set_updated_at();
