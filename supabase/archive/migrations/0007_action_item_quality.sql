-- Loop — action-item quality layer borrowed from DANI's validated patterns:
-- meeting classification, confidence gating, source quotes, review queue,
-- dependencies, feedback, and append-only status history.

-- Meeting classification (skip catch-ups) -----------------------------------
alter table meetings
  add column if not exists category text
    check (category in ('catch_up','deal_origination','project_execution','follow_up','unknown'));

-- Commitment quality fields ------------------------------------------------
alter table commitments
  add column if not exists confidence_score numeric check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  add column if not exists needs_review boolean not null default false,
  add column if not exists source_quote text,
  add column if not exists snoozed_until date;

create index if not exists commitments_needs_review_idx
  on commitments(org_id) where needs_review = true;

-- Dependencies (blocked-by) ------------------------------------------------
create table if not exists commitment_dependencies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  commitment_id   uuid not null references commitments(id) on delete cascade,
  blocked_by_id   uuid not null references commitments(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (commitment_id, blocked_by_id),
  check (commitment_id <> blocked_by_id)
);
create index if not exists commitment_deps_commitment_idx on commitment_dependencies(commitment_id);
create index if not exists commitment_deps_blocked_by_idx on commitment_dependencies(blocked_by_id);

alter table commitment_dependencies enable row level security;
drop policy if exists commitment_deps_rw on commitment_dependencies;
create policy commitment_deps_rw on commitment_dependencies
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Feedback (accurate / incorrect) ------------------------------------------
create table if not exists commitment_feedback (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  commitment_id   uuid not null references commitments(id) on delete cascade,
  actor_id        uuid references users(id) on delete set null,
  label           text not null check (label in ('accurate','incorrect')),
  error_category  text, -- vague | wrong_owner | wrong_date | hallucinated | duplicate | other
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists commitment_feedback_commitment_idx on commitment_feedback(commitment_id);

alter table commitment_feedback enable row level security;
drop policy if exists commitment_feedback_rw on commitment_feedback;
create policy commitment_feedback_rw on commitment_feedback
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Status history (append-only, channel-aware) ------------------------------
create table if not exists commitment_status_history (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  commitment_id   uuid not null references commitments(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  channel         text not null default 'ui' check (channel in ('ui','whatsapp','api','system','engine')),
  actor_id        uuid references users(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists commitment_status_history_commitment_idx
  on commitment_status_history(commitment_id, created_at desc);

alter table commitment_status_history enable row level security;
drop policy if exists commitment_status_history_select on commitment_status_history;
create policy commitment_status_history_select on commitment_status_history
  using (org_id = auth_org_id());
drop policy if exists commitment_status_history_insert on commitment_status_history;
create policy commitment_status_history_insert on commitment_status_history
  with check (org_id = auth_org_id());
