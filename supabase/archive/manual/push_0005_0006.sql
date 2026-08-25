-- Paste into Supabase SQL Editor if CLI cannot push migrations.
-- Combines 0005_bootstrap.sql + 0006_cron.sql for Company OS (xtvtjbbsilqnwqsmnchx).

-- ===== 0005 bootstrap =====
create table if not exists invites (
  token       uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('owner','admin','manager','member')),
  manager_id  uuid references users(id) on delete set null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists invites_org_idx on invites(org_id);
create index if not exists invites_email_idx on invites(lower(email));

alter table invites enable row level security;
drop policy if exists invites_admin on invites;
create policy invites_admin on invites
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id() and auth_is_admin());

create or replace function bootstrap_organization(p_name text, p_full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_slug text;
  v_email text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from users where id = auth.uid()) then
    raise exception 'already provisioned';
  end if;

  v_email := coalesce(auth.jwt() ->> 'email', '');
  v_name := coalesce(nullif(trim(p_full_name), ''), auth.jwt() ->> 'full_name', split_part(v_email, '@', 1), 'Owner');
  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_name), ''), 'org'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'org'; end if;
  v_slug := v_slug || '-' || substr(replace(auth.uid()::text, '-', ''), 1, 8);

  insert into organizations (name, slug, plan, settings)
  values (
    coalesce(nullif(trim(p_name), ''), 'My organization'),
    v_slug,
    'pilot',
    jsonb_build_object(
      'report_frequency', 'daily',
      'timezone', 'Africa/Nairobi',
      'escalation_sla_hours', 24,
      'data_retention_months', 12,
      'default_classification', 'internal',
      'require_classification', true,
      'autonomy_enabled', true,
      'checkin_stale_hours', 48,
      'nudge_after_hours', 24,
      'report_channels', jsonb_build_object('email', true, 'in_app', true, 'whatsapp', false),
      'report_recipient_ids', jsonb_build_array(auth.uid())
    )
  )
  returning id into v_org_id;

  insert into users (id, org_id, full_name, email, role, status, notification_prefs, last_active_at)
  values (
    auth.uid(),
    v_org_id,
    v_name,
    v_email,
    'owner',
    'active',
    '{"whatsapp_checkins": true}'::jsonb,
    now()
  );

  insert into tags (org_id, name, color, classification, pii, description) values
    (v_org_id, 'client data', 'teal', 'confidential', false, 'Data belonging to or about a client.'),
    (v_org_id, 'financials', 'amber', 'confidential', false, 'Revenue, invoices, budgets, pricing.'),
    (v_org_id, 'engineering', 'slate', 'internal', false, 'Specs, APIs, infrastructure.'),
    (v_org_id, 'pii', 'red', 'restricted', true, 'Personally identifiable information.'),
    (v_org_id, 'hr', 'red', 'restricted', true, 'People, payroll, performance.'),
    (v_org_id, 'legal', 'amber', 'confidential', false, 'Contracts, NDAs, compliance.'),
    (v_org_id, 'credentials', 'red', 'restricted', false, 'Secrets, keys, passwords.');

  insert into ownership_map (org_id, category, primary_owner_id, backup_owner_id, sla_hours)
  values (v_org_id, 'default', auth.uid(), null, 24);

  return v_org_id;
end;
$$;

revoke all on function bootstrap_organization(text, text) from public;
grant execute on function bootstrap_organization(text, text) to authenticated;

create or replace function accept_invite(p_token uuid, p_full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invites%rowtype;
  v_email text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from users where id = auth.uid()) then
    raise exception 'already provisioned';
  end if;

  select * into v_inv from invites where token = p_token;
  if not found then
    raise exception 'invite not found';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email <> lower(v_inv.email) then
    raise exception 'invite email mismatch';
  end if;

  v_name := coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1));

  insert into users (id, org_id, full_name, email, role, manager_id, status, notification_prefs, last_active_at)
  values (
    auth.uid(),
    v_inv.org_id,
    v_name,
    v_email,
    v_inv.role,
    v_inv.manager_id,
    'active',
    '{"whatsapp_checkins": true}'::jsonb,
    now()
  );

  delete from invites where token = p_token;
  return v_inv.org_id;
end;
$$;

revoke all on function accept_invite(uuid, text) from public;
grant execute on function accept_invite(uuid, text) to authenticated;

drop policy if exists checkins_insert_manager on checkins;
create policy checkins_insert_manager on checkins for insert
  with check (
    org_id = auth_org_id()
    and auth_is_manager_plus()
    and direction = 'outbound'
  );

drop policy if exists notifications_insert_org on notifications;
create policy notifications_insert_org on notifications for insert
  with check (org_id = auth_org_id());

drop policy if exists audit_insert_org on audit_log;
create policy audit_insert_org on audit_log for insert
  with check (org_id = auth_org_id());

drop policy if exists commitments_update_self_status on commitments;
create policy commitments_update_self_status on commitments for update
  using (org_id = auth_org_id() and owner_id = auth.uid())
  with check (org_id = auth_org_id() and owner_id = auth.uid());

-- ===== 0006 cron =====
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function invoke_edge(fn text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  base text := 'https://xtvtjbbsilqnwqsmnchx.supabase.co/functions/v1/';
  key  text;
begin
  begin
    select decrypted_secret into key
    from vault.decrypted_secrets
    where name = 'loop_service_role_key'
    limit 1;
  exception when others then
    key := null;
  end;

  if key is null or key = '' then
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

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname like 'loop-%';
exception when others then null;
end $$;

select cron.schedule('loop-send-checkin', '0 * * * *', $$select invoke_edge('send-checkin')$$);
select cron.schedule('loop-escalate-sweep', '*/30 * * * *', $$select invoke_edge('escalate')$$);
select cron.schedule('loop-generate-report-daily', '0 6 * * *', $$select invoke_edge('generate-report')$$);
select cron.schedule('loop-retention-purge', '30 2 * * *', $$
  delete from checkins c using organizations o
    where c.org_id = o.id
      and c.created_at < now() - ((coalesce((o.settings->>'data_retention_months')::int, 12)) || ' months')::interval;
  delete from audit_log a using organizations o
    where a.org_id = o.id
      and a.created_at < now() - ((coalesce((o.settings->>'data_retention_months')::int, 12)) || ' months')::interval;
$$;
