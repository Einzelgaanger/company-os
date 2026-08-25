-- Loop — scheduled jobs (BUILD_SPEC Section 8.3, 8.5, 8.6)
-- Requires pg_cron + pg_net. Auth uses the service_role key stored in Vault
-- under name `loop_service_role_key` (set once after deploy; see README).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function invoke_edge(fn text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  base text := 'https://pkxnfkubgpbdbftvtgvf.supabase.co/functions/v1/';
  key  text;
begin
  select decrypted_secret into key
  from vault.decrypted_secrets
  where name = 'loop_service_role_key'
  limit 1;

  if key is null or key = '' then
    -- Fall back to GUC if Vault is not configured yet.
    key := current_setting('app.settings.service_role_key', true);
  end if;

  if key is null or key = '' then
    raise notice 'invoke_edge(%) skipped — set vault secret loop_service_role_key', fn;
    return;
  end if;

  perform net.http_post(
    url := base || fn,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Unschedule if re-applied
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname like 'loop-%';
exception when others then null;
end $$;

select cron.schedule('loop-send-checkin', '0 * * * *', $$select invoke_edge('send-checkin')$$);
select cron.schedule('loop-escalate-sweep', '*/30 * * * *', $$select invoke_edge('escalate')$$);
select cron.schedule('loop-generate-report-daily', '0 6 * * *', $$select invoke_edge('generate-report')$$);
select cron.schedule('loop-send-digest', '0 * * * *', $$select invoke_edge('send-digest')$$);
select cron.schedule('loop-retention-purge', '30 2 * * *', $$
  delete from checkins c using organizations o
    where c.org_id = o.id
      and c.created_at < now() - ((coalesce((o.settings->>'data_retention_months')::int, 12)) || ' months')::interval;
  delete from audit_log a using organizations o
    where a.org_id = o.id
      and a.created_at < now() - ((coalesce((o.settings->>'data_retention_months')::int, 12)) || ' months')::interval;
$$);
