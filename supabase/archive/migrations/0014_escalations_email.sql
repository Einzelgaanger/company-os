-- Company OS — escalation triage and the email delivery system.
--
-- Escalations gain an urgency model so a person's escalation tab is a ranked
-- queue rather than a list in arrival order. Scoring is deterministic (SLA
-- breach, priority, overdue days, blast radius, repeats) and the model only
-- writes the one-line rationale, so the ordering is explainable and testable.
--
-- Email becomes a first-class channel: every send is logged, preference- and
-- suppression-checked, and retried, rather than fire-and-forget from one
-- report function.

-- ESCALATION TRIAGE ---------------------------------------------------------
alter table escalations add column if not exists urgency_score numeric(5,2);
alter table escalations add column if not exists urgency_band text
  check (urgency_band in ('critical','high','medium','low'));
alter table escalations add column if not exists urgency_rationale text;
alter table escalations add column if not exists urgency_computed_at timestamptz;
-- When this escalation breaches its SLA. Drives the top of the urgency score.
alter table escalations add column if not exists due_by timestamptz;
alter table escalations add column if not exists sla_hours int not null default 24;
alter table escalations add column if not exists first_response_at timestamptz;
-- Bumped each time the same commitment escalates again.
alter table escalations add column if not exists repeat_count int not null default 1;
alter table escalations add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists escalations_inbox_idx
  on escalations (escalated_to_id, status, urgency_score desc nulls last);
create index if not exists escalations_due_idx
  on escalations (status, due_by) where status <> 'resolved';

comment on column escalations.urgency_score is '0-100, recomputed by escalation-triage. Deterministic; see _shared/escalationUrgency.ts.';

-- Backfill due_by for rows created before this migration.
update escalations
  set due_by = created_at + make_interval(hours => sla_hours)
  where due_by is null;

-- EMAIL PREFERENCES ---------------------------------------------------------
-- Per-category opt-outs. Absent key means opted in.
alter table users add column if not exists email_prefs jsonb not null default '{}';
alter table users add column if not exists email_unsubscribe_token text;

update users
  set email_unsubscribe_token = encode(gen_random_bytes(16), 'hex')
  where email_unsubscribe_token is null;

create unique index if not exists users_email_unsub_token_uidx
  on users (email_unsubscribe_token) where email_unsubscribe_token is not null;

comment on column users.email_prefs is 'Category opt-outs, e.g. {"digest": false}. Categories: escalation, checkin, survey, report, digest, project_pulse, system.';

-- EMAIL DELIVERY LOG --------------------------------------------------------
create table if not exists email_messages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  user_id        uuid references users(id) on delete set null,
  to_email       text not null,
  category       text not null check (category in
                   ('escalation','checkin','survey','report','digest','project_pulse','system')),
  template       text not null,
  subject        text not null,
  body_html      text not null,
  status         text not null default 'queued' check (status in
                   ('queued','sent','failed','skipped','suppressed')),
  -- Why a send did not happen: 'no_api_key', 'opted_out', 'suppressed', 'no_address'.
  skip_reason    text,
  provider       text,
  provider_id    text,
  error_message  text,
  attempts       int not null default 0,
  related_type   text,
  related_id     uuid,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  -- Set by callers that must not double-send (one report per recipient, etc).
  idempotency_key text
);
create index if not exists email_messages_org_idx on email_messages(org_id, created_at desc);
create index if not exists email_messages_user_idx on email_messages(user_id, created_at desc);
create index if not exists email_messages_retry_idx on email_messages(status, attempts)
  where status = 'failed';
create unique index if not exists email_messages_idempotency_uidx
  on email_messages (org_id, idempotency_key) where idempotency_key is not null;

-- SUPPRESSION LIST ----------------------------------------------------------
-- Hard bounces, spam complaints, and unsubscribes. Checked before every send.
create table if not exists email_suppressions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null,
  reason     text not null check (reason in ('bounce','complaint','unsubscribe','manual')),
  detail     text,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- RLS -----------------------------------------------------------------------
alter table email_messages    enable row level security;
alter table email_suppressions enable row level security;

drop policy if exists email_messages_select on email_messages;
drop policy if exists email_suppressions_select_admin on email_suppressions;
drop policy if exists email_suppressions_write_admin on email_suppressions;

-- People can see their own mail trail; admins see the org's for deliverability
-- debugging. Nobody writes from the client — Edge Functions use the service role.
create policy email_messages_select on email_messages for select
  using (org_id = auth_org_id() and (auth_is_admin() or user_id = auth.uid()));

create policy email_suppressions_select_admin on email_suppressions for select
  using (org_id = auth_org_id() and auth_is_admin());
create policy email_suppressions_write_admin on email_suppressions for all
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id() and auth_is_admin());

-- SCHEDULE ------------------------------------------------------------------
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in
    ('loop-escalation-triage','loop-email-retry');
exception when others then null;
end $$;

-- Re-rank every open escalation; SLA pressure changes hourly.
select cron.schedule('loop-escalation-triage', '10 * * * *', $$select invoke_edge('escalation-triage')$$);
select cron.schedule('loop-email-retry', '20 * * * *', $$select invoke_edge('email-dispatch')$$);
