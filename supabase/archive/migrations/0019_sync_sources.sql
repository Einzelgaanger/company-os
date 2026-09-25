-- Let any connected provider land in the hold queue, and poll them.
alter table meetings drop constraint if exists meetings_source_check;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'loop-sync-sources';
exception when others then null;
end $$;

select cron.schedule(
  'loop-sync-sources',
  '*/15 * * * *',
  $$select invoke_edge('sync-sources')$$
);
