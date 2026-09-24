-- Go-live: project membership + email log so admins can invite and staff projects.
-- Safe to re-run. Apply in Supabase SQL Editor if the CLI login-role endpoint returns 403.

create table if not exists project_members (
  org_id          uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role_in_project text not null default 'contributor'
                    check (role_in_project in ('lead','contributor','reviewer','observer')),
  allocation_pct  int not null default 100 check (allocation_pct between 0 and 100),
  added_at        timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on project_members(user_id);
create index if not exists project_members_org_idx on project_members(org_id);

alter table project_members enable row level security;
drop policy if exists project_members_select on project_members;
drop policy if exists project_members_write_manager on project_members;
create policy project_members_select on project_members for select
  using (org_id = auth_org_id());
create policy project_members_write_manager on project_members for all
  using (org_id = auth_org_id() and auth_is_manager_plus())
  with check (org_id = auth_org_id() and auth_is_manager_plus());

alter table users add column if not exists email_prefs jsonb not null default '{}';
alter table users add column if not exists email_unsubscribe_token text;

create table if not exists email_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  user_id         uuid references users(id) on delete set null,
  to_email        text not null,
  category        text not null check (category in
                    ('escalation','checkin','survey','report','digest','project_pulse','system')),
  template        text not null,
  subject         text not null,
  body_html       text not null,
  status          text not null default 'queued' check (status in
                    ('queued','sent','failed','skipped','suppressed')),
  skip_reason     text,
  provider        text,
  provider_id     text,
  error_message   text,
  attempts        int not null default 0,
  related_type    text,
  related_id      uuid,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  idempotency_key text
);
create index if not exists email_messages_org_idx on email_messages(org_id, created_at desc);

create table if not exists email_suppressions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null,
  reason     text not null check (reason in ('bounce','complaint','unsubscribe','manual')),
  detail     text,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

alter table email_messages enable row level security;
alter table email_suppressions enable row level security;
drop policy if exists email_messages_select on email_messages;
create policy email_messages_select on email_messages for select
  using (org_id = auth_org_id() and (auth_is_admin() or user_id = auth.uid()));
drop policy if exists email_suppressions_select_admin on email_suppressions;
drop policy if exists email_suppressions_write_admin on email_suppressions;
create policy email_suppressions_select_admin on email_suppressions for select
  using (org_id = auth_org_id() and auth_is_admin());
create policy email_suppressions_write_admin on email_suppressions for all
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id() and auth_is_admin());
