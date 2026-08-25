-- Loop — scheduled jobs (BUILD_SPEC Section 8.3, 8.5, 8.6)
-- Requires the pg_cron and pg_net extensions (available on Supabase).
-- Replace <PROJECT_REF> and set app.settings.service_role_key before enabling.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper to POST to an Edge Function with the service-role key.
create or replace function invoke_edge(fn text) returns void
  language plpgsql security definer as $$
declare
  base text := 'https://<PROJECT_REF>.functions.supabase.co/';
  key  text := current_setting('app.settings.service_role_key', true);
begin
  perform net.http_post(
    url := base || fn,
    headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

-- Hourly check-in sweep. Each function is responsible for honouring per-org
-- timezone (Section 14) internally.
select cron.schedule('loop-send-checkin', '0 * * * *', $$select invoke_edge('send-checkin')$$);

-- Escalation sweep every 30 minutes (past-due, unanswered commitments).
select cron.schedule('loop-escalate-sweep', '*/30 * * * *', $$select invoke_edge('escalate')$$);

-- Daily report at 06:00 UTC (function fans out per org timezone).
select cron.schedule('loop-generate-report-daily', '0 6 * * *', $$select invoke_edge('generate-report')$$);

-- Retention purge nightly (Section 13): older-than-window checkins & audit_log.
select cron.schedule('loop-retention-purge', '30 2 * * *', $$
  delete from checkins c using organizations o
    where c.org_id = o.id
      and c.created_at < now() - ((coalesce((o.settings->>'data_retention_months')::int, 12)) || ' months')::interval;
  delete from audit_log a using organizations o
    where a.org_id = o.id
      and a.created_at < now() - ((coalesce((o.settings->>'data_retention_months')::int, 12)) || ' months')::interval;
$$);
