-- Loop — data governance: classification, tagging, and access trail.
--
-- Adds sensitivity classification + tags to the data-carrying entities and a
-- data_access_log for the governance audit trail. Sensitivity is enforced in
-- app + RLS (see the clearance helpers below).

-- SENSITIVITY ENUM ---------------------------------------------------------
do $$ begin
  create type sensitivity as enum ('public','internal','confidential','restricted');
exception when duplicate_object then null; end $$;

-- TAGS ---------------------------------------------------------------------
create table if not exists tags (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  color          text not null default 'slate',
  classification sensitivity not null default 'internal',
  pii            boolean not null default false,
  description    text,
  created_at     timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists tags_org_idx on tags(org_id);

-- CLASSIFICATION COLUMNS on data-carrying entities -------------------------
alter table commitments
  add column if not exists sensitivity   sensitivity not null default 'internal',
  add column if not exists tag_ids       uuid[] not null default '{}',
  add column if not exists classified_by text check (classified_by in ('system','user'));

alter table meetings
  add column if not exists sensitivity sensitivity not null default 'internal',
  add column if not exists tag_ids     uuid[] not null default '{}';

alter table projects
  add column if not exists sensitivity sensitivity not null default 'internal',
  add column if not exists tag_ids     uuid[] not null default '{}';

-- DATA ACCESS LOG ----------------------------------------------------------
create table if not exists data_access_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  actor_id    uuid references users(id) on delete set null,
  entity_type text not null check (entity_type in ('commitment','meeting','project','checkin','report')),
  entity_id   uuid not null,
  sensitivity sensitivity not null,
  action      text not null check (action in ('view','export','share','reclassify')),
  created_at  timestamptz not null default now()
);
create index if not exists data_access_log_org_idx on data_access_log(org_id, created_at desc);

-- CLEARANCE HELPERS --------------------------------------------------------
-- Numeric rank for a sensitivity level.
create or replace function sensitivity_rank(s sensitivity)
returns int language sql immutable as $$
  select case s
    when 'public' then 0
    when 'internal' then 1
    when 'confidential' then 2
    when 'restricted' then 3
  end;
$$;

-- Max sensitivity the current user is cleared for, from their role.
create or replace function auth_clearance()
returns int language sql stable security definer set search_path = public as $$
  select case auth_role()
    when 'owner' then 3
    when 'admin' then 3
    when 'manager' then 2
    else 1
  end;
$$;

-- RLS: layer sensitivity on top of existing commitment policies. Owner and
-- requester always retain access to their own items (need-to-know).
alter table tags enable row level security;
alter table data_access_log enable row level security;

drop policy if exists tags_rw on tags;
create policy tags_rw on tags
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id() and auth_is_admin());

drop policy if exists dal_read on data_access_log;
create policy dal_read on data_access_log
  using (org_id = auth_org_id() and auth_is_manager_plus());

drop policy if exists dal_insert on data_access_log;
create policy dal_insert on data_access_log
  with check (org_id = auth_org_id());

-- Sensitivity gate for commitments. Multiple permissive policies are OR'd, so
-- we REPLACE the original select policy (from 0002_rls.sql) to AND the
-- role-scope check with a clearance check. Owner/requester keep need-to-know.
drop policy if exists commitments_select on commitments;
create policy commitments_select on commitments for select
  using (
    org_id = auth_org_id()
    and (
      auth_is_admin()
      or owner_id = auth.uid()
      or requested_by_id = auth.uid()
      or (
        auth_role() = 'manager'
        and (auth_manages(owner_id) or auth_manages(requested_by_id))
        and sensitivity_rank(sensitivity) <= auth_clearance()
      )
      or sensitivity_rank(sensitivity) <= 1  -- internal & below are org-visible
    )
  );
