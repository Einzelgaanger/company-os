-- Company OS — teams, project membership, project routing, and project progress.
--
-- Three things this adds:
--  1. Managers can build teams and staff projects (teams, team_members, project_members).
--  2. Anything ingested (meeting, calendar event, chat) can be routed to a project,
--     so extracted commitments land on the right project automatically.
--  3. Attributed per-person project feedback (project_pulses) is quantified nightly
--     into a project progress snapshot: percent delivered, who is on what, the main
--     blocker, and a forecast completion date.
--
-- Note the deliberate contrast with 0012: survey responses are anonymous because
-- they measure the working environment. Project pulses are attributed because they
-- are work status, which a manager is entitled to see.

-- TEAMS ---------------------------------------------------------------------
create table if not exists teams (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  description    text,
  lead_user_id   uuid references users(id) on delete set null,
  parent_team_id uuid references teams(id) on delete set null,
  created_by_id  uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists teams_org_idx on teams(org_id);

create table if not exists team_members (
  org_id       uuid not null references organizations(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role_in_team text not null default 'member' check (role_in_team in ('lead','member')),
  added_at     timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on team_members(user_id);

-- PROJECT MEMBERSHIP --------------------------------------------------------
create table if not exists project_members (
  org_id          uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role_in_project text not null default 'contributor'
                    check (role_in_project in ('lead','contributor','reviewer','observer')),
  -- Rough share of this person's time, used to weight expected delivery.
  allocation_pct  int not null default 100 check (allocation_pct between 0 and 100),
  added_at        timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on project_members(user_id);
create index if not exists project_members_org_idx on project_members(org_id);

-- PROJECTS ------------------------------------------------------------------
alter table projects add column if not exists team_id uuid references teams(id) on delete set null;
-- Routing profile: free-text signals used to match inbound meetings and events.
alter table projects add column if not exists keywords text[] not null default '{}';
alter table projects add column if not exists client_aliases text[] not null default '{}';
alter table projects add column if not exists start_date date;
alter table projects add column if not exists target_date date;
-- Denormalised from the latest snapshot so list views stay cheap.
alter table projects add column if not exists progress_pct numeric(5,2);
alter table projects add column if not exists health text check (health in ('on_track','at_risk','off_track','unknown'));
alter table projects add column if not exists forecast_completion_date date;
alter table projects add column if not exists last_progress_at timestamptz;
alter table projects add column if not exists pulse_enabled boolean not null default true;
-- Days between autonomous pulses per member.
alter table projects add column if not exists pulse_interval_days int not null default 3;

comment on column projects.keywords is 'Routing signals: phrases that identify this project in meeting titles and transcripts.';
comment on column projects.client_aliases is 'Alternate client spellings used when routing inbound meetings.';

-- ROUTING TARGETS -----------------------------------------------------------
alter table meetings add column if not exists project_id uuid references projects(id) on delete set null;
alter table meetings add column if not exists project_match_confidence numeric(3,2);
alter table meetings add column if not exists project_match_method text
  check (project_match_method in ('calendar','participants','keyword','client','llm','manual','none'));
create index if not exists meetings_project_idx on meetings(project_id);

alter table calendar_events add column if not exists project_id uuid references projects(id) on delete set null;
alter table calendar_events add column if not exists project_match_confidence numeric(3,2);
create index if not exists calendar_events_project_idx on calendar_events(project_id);

-- Project pulses are delivered as check-ins, so check-ins need a project dimension.
alter table checkins add column if not exists project_id uuid references projects(id) on delete set null;
create index if not exists checkins_project_idx on checkins(project_id, created_at desc);

-- PROJECT PULSES ------------------------------------------------------------
-- One row per (project, member, ask). Created when the pulse is sent, completed
-- when the person replies. Attributed by design.
create table if not exists project_pulses (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  asked_at       timestamptz not null default now(),
  asked_checkin_id uuid references checkins(id) on delete set null,
  responded_at   timestamptz,
  response_checkin_id uuid references checkins(id) on delete set null,
  status         text check (status in ('on_track','at_risk','blocked','done','unclear')),
  -- Self-reported completion on this person's slice of the project.
  self_progress_pct int check (self_progress_pct between 0 and 100),
  progress_note  text,
  blocker_text   text,
  needs_text     text,
  confidence     numeric(3,2),
  created_at     timestamptz not null default now()
);
create index if not exists project_pulses_project_idx on project_pulses(project_id, asked_at desc);
create index if not exists project_pulses_user_idx on project_pulses(user_id, asked_at desc);
create index if not exists project_pulses_open_idx on project_pulses(project_id, user_id)
  where responded_at is null;

-- PROJECT PROGRESS SNAPSHOTS ------------------------------------------------
-- Written nightly. This is what the project page reads.
create table if not exists project_progress_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  project_id            uuid not null references projects(id) on delete cascade,
  as_of                 date not null,

  -- Delivery: weighted commitment points. "What everyone should do" vs "what is done".
  total_points          numeric(10,2) not null default 0,
  done_points           numeric(10,2) not null default 0,
  progress_pct          numeric(5,2) not null default 0,

  commitments_total     int not null default 0,
  commitments_done      int not null default 0,
  commitments_active    int not null default 0,
  commitments_overdue   int not null default 0,
  commitments_blocked   int not null default 0,
  open_escalations      int not null default 0,

  -- Attributed feedback rolled up.
  pulses_sent           int not null default 0,
  pulses_responded      int not null default 0,
  pulse_on_track        int not null default 0,
  pulse_at_risk         int not null default 0,
  pulse_blocked         int not null default 0,

  -- Per-person: {user_id, name, total_points, done_points, pct, active_titles[],
  -- status, blocker, responded_at}
  member_breakdown      jsonb not null default '[]',
  -- Ranked blockers drawn from pulses and escalations; [0] is the main blocker.
  top_blockers          jsonb not null default '[]',
  -- What people said they need, ranked by frequency.
  needs                 jsonb not null default '[]',
  -- In-flight work right now: {commitment_id, title, owner_id, owner_name, due_date, status}
  in_flight             jsonb not null default '[]',
  -- Trailing points completed per week, used for the forecast.
  velocity_per_week     numeric(10,2) not null default 0,
  forecast_completion_date date,
  forecast_confidence   numeric(3,2),
  forecast_basis        text,
  health                text not null default 'unknown'
                          check (health in ('on_track','at_risk','off_track','unknown')),
  created_at            timestamptz not null default now(),
  unique (project_id, as_of)
);
create index if not exists project_progress_project_idx on project_progress_snapshots(project_id, as_of desc);

-- HELPERS -------------------------------------------------------------------

-- Priority-weighted effort. Keeps "percent done" from treating a critical
-- deliverable and a trivial follow-up as equal units of work.
create or replace function commitment_points(p_priority text)
  returns numeric language sql immutable as $$
  select case p_priority
           when 'critical' then 5::numeric
           when 'high'     then 3::numeric
           when 'medium'   then 2::numeric
           else 1::numeric
         end
$$;

-- True when the caller is on the project, leads its team, or is manager+.
create or replace function auth_on_project(p_project uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project and pm.user_id = auth.uid()
  ) or exists (
    select 1 from projects p
    left join teams t on t.id = p.team_id
    where p.id = p_project
      and p.org_id = auth_org_id()
      and (p.owner_id = auth.uid() or t.lead_user_id = auth.uid())
  )
$$;

-- RLS -----------------------------------------------------------------------
alter table teams                     enable row level security;
alter table team_members              enable row level security;
alter table project_members           enable row level security;
alter table project_pulses            enable row level security;
alter table project_progress_snapshots enable row level security;

drop policy if exists teams_select on teams;
drop policy if exists teams_write_manager on teams;
drop policy if exists team_members_select on team_members;
drop policy if exists team_members_write_manager on team_members;
drop policy if exists project_members_select on project_members;
drop policy if exists project_members_write_manager on project_members;
drop policy if exists project_pulses_select on project_pulses;
drop policy if exists project_pulses_update_self on project_pulses;
drop policy if exists project_progress_select on project_progress_snapshots;

create policy teams_select on teams for select
  using (org_id = auth_org_id());
create policy teams_write_manager on teams for all
  using (org_id = auth_org_id() and auth_is_manager_plus())
  with check (org_id = auth_org_id() and auth_is_manager_plus());

create policy team_members_select on team_members for select
  using (org_id = auth_org_id());
create policy team_members_write_manager on team_members for all
  using (org_id = auth_org_id() and auth_is_manager_plus())
  with check (org_id = auth_org_id() and auth_is_manager_plus());

create policy project_members_select on project_members for select
  using (org_id = auth_org_id());
create policy project_members_write_manager on project_members for all
  using (org_id = auth_org_id() and auth_is_manager_plus())
  with check (org_id = auth_org_id() and auth_is_manager_plus());

-- Own pulses, your reports' pulses, or any pulse on a project you run.
create policy project_pulses_select on project_pulses for select
  using (
    org_id = auth_org_id() and (
      auth_is_admin()
      or user_id = auth.uid()
      or auth_manages(user_id)
      or auth_on_project(project_id)
    )
  );
create policy project_pulses_update_self on project_pulses for update
  using (org_id = auth_org_id() and user_id = auth.uid())
  with check (org_id = auth_org_id() and user_id = auth.uid());

create policy project_progress_select on project_progress_snapshots for select
  using (org_id = auth_org_id() and (auth_is_manager_plus() or auth_on_project(project_id)));

-- SCHEDULE ------------------------------------------------------------------
-- invoke_edge() is defined in 0006_cron.sql.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname like 'loop-project-%';
exception when others then null;
end $$;

-- Hourly; the function honours each project's pulse_interval_days and the
-- per-person daily message cap.
select cron.schedule('loop-project-pulse', '15 * * * *', $$select invoke_edge('project-pulse')$$);
-- Recompute snapshots after the day's replies have landed.
select cron.schedule('loop-project-progress', '45 23 * * *', $$select invoke_edge('project-progress')$$);
