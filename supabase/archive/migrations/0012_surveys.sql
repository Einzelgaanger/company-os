-- Company OS — daily adaptive surveys (spec 07_SURVEYS_SENTIMENT).
-- Five AI-generated open-text questions per day, scoped to the project or
-- department a person is actually working in. Aggregated weekly for line
-- managers.
--
-- C-2 invariant: there is no per-person output anywhere. survey_responses has
-- no user_id column; responses are keyed by HMAC(user_id, cycle salt) and the
-- salt is destroyed when the cycle closes. Aggregates below five respondents
-- cannot be written (CHECK) and are never surfaced.

-- USERS ---------------------------------------------------------------------
alter table users add column if not exists department text;
create index if not exists users_department_idx on users(org_id, department);

comment on column users.department is 'Department used as the survey scope when a person has no active project.';

-- SURVEY CYCLES -------------------------------------------------------------
-- One cycle per (org, scope, day). Scope is a project, a department, or the
-- whole org for people who match neither.
create table if not exists survey_cycles (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  scope_type           text not null check (scope_type in ('project','department','org')),
  scope_key            text not null,
  scope_label          text not null,
  survey_date          date not null,
  theme                text,
  generation_rationale text,
  status               text not null default 'draft'
                         check (status in ('draft','pending_review','live','closed','suppressed','failed')),
  -- Per-cycle HMAC key. Nulled on close, after which respondent_hash cannot be
  -- traced back to a person by anyone, including the service role.
  respondent_salt      text,
  invited_count        int not null default 0,
  respondent_count     int not null default 0,
  created_at           timestamptz not null default now(),
  opened_at            timestamptz,
  closed_at            timestamptz,
  unique (org_id, scope_type, scope_key, survey_date)
);
create index if not exists survey_cycles_org_date_idx on survey_cycles(org_id, survey_date desc);
create index if not exists survey_cycles_live_idx on survey_cycles(org_id, status) where status = 'live';

-- SURVEY QUESTIONS ----------------------------------------------------------
-- topic is constrained to the fixed taxonomy in spec §7.3. The generator picks
-- emphasis and wording within these; it never chooses subject matter.
create table if not exists survey_questions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  cycle_id             uuid not null references survey_cycles(id) on delete cascade,
  sort_order           int not null,
  question_text        text not null,
  topic                text not null check (topic in (
                         'clarity','blockers','resources','process',
                         'workload','dependencies','tooling','information')),
  -- Why the gap scorer asked for this topic today. Shown to admins on review.
  probe_reason         text,
  generated_by         text not null default 'ai' check (generated_by in ('ai','admin','template')),
  approved             boolean,
  approved_by_user_id  uuid references users(id) on delete set null,
  approved_at          timestamptz,
  unique (cycle_id, sort_order)
);
create index if not exists survey_questions_cycle_idx on survey_questions(cycle_id);
create index if not exists survey_questions_topic_idx on survey_questions(org_id, topic);

-- SURVEY RESPONSES ----------------------------------------------------------
-- Deliberately has no user_id. Do not add one.
create table if not exists survey_responses (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  cycle_id            uuid not null references survey_cycles(id) on delete cascade,
  question_id         uuid not null references survey_questions(id) on delete cascade,
  respondent_hash     text not null,
  answer_text         text not null,
  -- Set during aggregation, then purged. Never exposed on any read path.
  sentiment_label     text check (sentiment_label in ('positive','neutral','negative')),
  sentiment_purged_at timestamptz,
  created_at          timestamptz not null default now(),
  unique (question_id, respondent_hash)
);
create index if not exists survey_responses_cycle_idx on survey_responses(cycle_id);
create index if not exists survey_responses_org_created_idx on survey_responses(org_id, created_at);

comment on table survey_responses is 'C-2: no user_id column. Keyed by HMAC(user_id, cycle salt); salt destroyed on close.';

-- SURVEY DELIVERIES ---------------------------------------------------------
-- Outbound bookkeeping only, so the sender is idempotent. Carries no answer
-- data and no record of who did or did not respond.
create table if not exists survey_deliveries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  cycle_id    uuid not null references survey_cycles(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  channel     text not null,
  sent_at     timestamptz not null default now(),
  unique (cycle_id, user_id)
);
create index if not exists survey_deliveries_user_idx on survey_deliveries(user_id, sent_at desc);

-- SURVEY AGGREGATES ---------------------------------------------------------
-- The only readable survey output. manager_line scope carries scope_key =
-- manager user id and is what the weekly report renders.
create table if not exists survey_aggregates (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizations(id) on delete cascade,
  scope_type              text not null check (scope_type in ('project','department','org','manager_line')),
  scope_key               text not null,
  scope_label             text not null,
  period_start            date not null,
  period_end              date not null,
  -- Database backstop for C-2: a bug in the aggregator still cannot write an
  -- aggregate that could identify individuals.
  respondent_count        int not null check (respondent_count >= 5),
  response_count          int not null default 0,
  invited_count           int not null default 0,
  themes                  jsonb not null default '[]',
  questions_asked         jsonb not null default '[]',
  sentiment_positive_pct  numeric(5,2),
  sentiment_neutral_pct   numeric(5,2),
  sentiment_negative_pct  numeric(5,2),
  created_at              timestamptz not null default now(),
  unique (org_id, scope_type, scope_key, period_start, period_end)
);
create index if not exists survey_aggregates_org_period_idx on survey_aggregates(org_id, period_end desc);

-- Weekly survey reports are a distinct report type.
alter table reports drop constraint if exists reports_type_check;
alter table reports add constraint reports_type_check
  check (type in ('daily','weekly','survey_weekly'));

-- HELPERS -------------------------------------------------------------------

-- HMAC the caller's identity with the cycle salt. Returns null once the cycle
-- has closed and the salt is gone, which is what makes responses irreversible.
create or replace function survey_respondent_hash(p_cycle uuid, p_user uuid)
  returns text language sql stable security definer set search_path = public, extensions as $$
  select case
           when c.respondent_salt is null then null
           else encode(extensions.hmac(p_user::text, c.respondent_salt, 'sha256'), 'hex')
         end
  from survey_cycles c
  where c.id = p_cycle
$$;

-- Has the caller already answered this cycle? The person's own answer state is
-- the only per-person survey fact any read path may expose, and only to them.
create or replace function survey_has_responded(p_cycle uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from survey_responses r
    where r.cycle_id = p_cycle
      and r.respondent_hash = survey_respondent_hash(p_cycle, auth.uid())
  )
$$;

-- Submit answers as {question_id: answer_text}. Blank answers are skipped, so
-- partial submissions are allowed and skipping leaves no record.
create or replace function submit_survey_response(p_cycle uuid, p_answers jsonb)
  returns int language plpgsql security definer set search_path = public as $$
declare
  v_cycle   survey_cycles%rowtype;
  v_hash    text;
  v_written int := 0;
  v_qid     uuid;
  v_text    text;
begin
  select * into v_cycle from survey_cycles where id = p_cycle;
  if not found then raise exception 'survey cycle not found'; end if;
  if v_cycle.status <> 'live' then raise exception 'survey cycle is not open'; end if;
  if v_cycle.org_id <> auth_org_id() then raise exception 'forbidden'; end if;

  v_hash := survey_respondent_hash(p_cycle, auth.uid());
  if v_hash is null then raise exception 'survey cycle is not open'; end if;

  for v_qid, v_text in select key::uuid, value #>> '{}' from jsonb_each(p_answers) loop
    if v_text is null or btrim(v_text) = '' then continue; end if;
    insert into survey_responses (org_id, cycle_id, question_id, respondent_hash, answer_text)
    select v_cycle.org_id, p_cycle, q.id, v_hash, btrim(v_text)
    from survey_questions q
    where q.id = v_qid and q.cycle_id = p_cycle
    on conflict (question_id, respondent_hash) do update set answer_text = excluded.answer_text;
    v_written := v_written + 1;
  end loop;

  update survey_cycles
    set respondent_count = (
      select count(distinct respondent_hash) from survey_responses where cycle_id = p_cycle
    )
    where id = p_cycle;

  return v_written;
end;
$$;

-- Transparency page (spec §7.8): a person reads back their own answers.
create or replace function my_survey_responses()
  returns table (
    cycle_id uuid,
    scope_label text,
    survey_date date,
    question_text text,
    answer_text text,
    created_at timestamptz
  )
  language sql stable security definer set search_path = public as $$
  select c.id, c.scope_label, c.survey_date, q.question_text, r.answer_text, r.created_at
  from survey_responses r
  join survey_cycles c on c.id = r.cycle_id
  join survey_questions q on q.id = r.question_id
  where c.respondent_salt is not null
    and r.respondent_hash = survey_respondent_hash(c.id, auth.uid())
  order by c.survey_date desc, q.sort_order
$$;

-- Withdrawal (spec §7.8). Only possible while the cycle is open, because after
-- close there is no way to tell which rows were the caller's.
create or replace function delete_my_survey_responses(p_cycle uuid)
  returns int language plpgsql security definer set search_path = public as $$
declare
  v_hash    text;
  v_deleted int;
begin
  v_hash := survey_respondent_hash(p_cycle, auth.uid());
  if v_hash is null then return 0; end if;
  delete from survey_responses where cycle_id = p_cycle and respondent_hash = v_hash;
  get diagnostics v_deleted = row_count;
  update survey_cycles
    set respondent_count = (
      select count(distinct respondent_hash) from survey_responses where cycle_id = p_cycle
    )
    where id = p_cycle;
  return v_deleted;
end;
$$;

-- RLS -----------------------------------------------------------------------
alter table survey_cycles     enable row level security;
alter table survey_questions  enable row level security;
alter table survey_responses  enable row level security;
alter table survey_deliveries enable row level security;
alter table survey_aggregates enable row level security;

create policy survey_cycles_select on survey_cycles for select
  using (org_id = auth_org_id());

create policy survey_questions_select on survey_questions for select
  using (org_id = auth_org_id());
create policy survey_questions_review_admin on survey_questions for update
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id());

-- survey_responses intentionally has no policy: no client may read or write raw
-- answers. Everything goes through the SECURITY DEFINER functions above, and
-- Edge Functions use the service role.

create policy survey_deliveries_select_self on survey_deliveries for select
  using (org_id = auth_org_id() and user_id = auth.uid());

-- Aggregates are manager+ only, and the CHECK above guarantees n >= 5.
create policy survey_aggregates_select on survey_aggregates for select
  using (org_id = auth_org_id() and auth_is_manager_plus());

-- SCHEDULE ------------------------------------------------------------------
-- invoke_edge() is defined in 0006_cron.sql.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname like 'loop-survey-%';
exception when others then null;
end $$;

-- Generate tomorrow's questions overnight so admins can review before send.
select cron.schedule('loop-survey-generate', '0 3 * * *', $$select invoke_edge('generate-survey')$$);
-- Hourly; the function only sends to orgs whose configured local send hour is now.
select cron.schedule('loop-survey-send', '0 * * * *', $$select invoke_edge('send-survey')$$);
select cron.schedule('loop-survey-close', '30 23 * * *', $$select invoke_edge('close-survey')$$);
-- Monday morning, covering the previous Monday-Sunday week.
select cron.schedule('loop-survey-weekly-report', '0 7 * * 1', $$select invoke_edge('survey-weekly-report')$$);
