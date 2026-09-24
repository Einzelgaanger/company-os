-- Company OS — tag audiences + ingestion labelling.
--
-- Two additions to 0004_governance.sql:
--
-- 1. A tag is no longer only a label, it is an access grant. Each tag carries
--    an audience ("everyone" / "only these people" / "everyone except" / "this
--    role and above"), enforced in RLS so it holds for the SPA and anything
--    else that reaches Postgres as a user rather than the service role.
--
-- 2. Everything connected apps pull in is classified on arrival. The org sets a
--    floor in organizations.settings.default_classification and layers rules on
--    top ("email is confidential", "mail from this domain is client data").

-- TAG AUDIENCES ------------------------------------------------------------

do $$ begin
  create type tag_audience_mode as enum ('everyone','only','except','role');
exception when duplicate_object then null; end $$;

alter table tags
  add column if not exists audience_mode            tag_audience_mode not null default 'everyone',
  add column if not exists audience_member_ids      uuid[] not null default '{}',
  add column if not exists audience_min_role        text not null default 'member'
    check (audience_min_role in ('owner','admin','manager','member')),
  -- When false the audience holds even against org admins (e.g. an HR case the
  -- admin is the subject of). Access is written to data_access_log either way.
  add column if not exists audience_admin_override  boolean not null default true;

-- "only" with nobody named would hide the data from everyone including its
-- author, which is never what an admin means — reject it at write time.
alter table tags drop constraint if exists tags_audience_members_present;
alter table tags add constraint tags_audience_members_present
  check (audience_mode <> 'only' or cardinality(audience_member_ids) > 0);

create index if not exists tags_audience_members_idx on tags using gin (audience_member_ids);

create or replace function role_rank(r text)
returns int language sql immutable as $$
  select case r
    when 'owner' then 3
    when 'admin' then 2
    when 'manager' then 1
    else 0
  end;
$$;

-- Does one tag admit this user? Mirrors src/lib/tagAccess.ts:tagAllows.
create or replace function tag_audience_allows(t tags, uid uuid, urole text)
returns boolean language sql stable as $$
  select case
    when t.audience_admin_override and urole in ('owner','admin') then true
    when t.audience_mode = 'everyone' then true
    when t.audience_mode = 'only'     then uid = any (t.audience_member_ids)
    when t.audience_mode = 'except'   then not (uid = any (t.audience_member_ids))
    when t.audience_mode = 'role'     then role_rank(urole) >= role_rank(t.audience_min_role)
    else false
  end;
$$;

-- Do ALL tags on a row admit the current user? Audiences intersect, so adding a
-- tag can only narrow who sees an item, never widen it. Unknown tag ids are
-- ignored rather than denied so deleting a tag cannot strand its data.
create or replace function auth_tag_access(p_tag_ids uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    bool_and(tag_audience_allows(t, auth.uid(), auth_role())),
    true
  )
  from tags t
  where t.id = any (coalesce(p_tag_ids, '{}'::uuid[]));
$$;

-- INGESTION LABEL RULES ----------------------------------------------------

create table if not exists ingestion_label_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  -- null provider / content_kind = "every connected app / everything it sends".
  provider      text,
  content_kind  text check (content_kind in ('email','calendar_event','meeting','chat_message','file')),
  match_type    text not null default 'all' check (match_type in ('all','keyword','from_domain')),
  match_value   text,
  sensitivity   sensitivity not null default 'internal',
  tag_ids       uuid[] not null default '{}',
  enabled       boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  constraint ingestion_label_rules_match_value_present
    check (match_type = 'all' or coalesce(btrim(match_value), '') <> '')
);
create index if not exists ingestion_label_rules_org_idx
  on ingestion_label_rules(org_id, sort_order);

alter table ingestion_label_rules enable row level security;

drop policy if exists ilr_read on ingestion_label_rules;
create policy ilr_read on ingestion_label_rules for select
  using (org_id = auth_org_id());

drop policy if exists ilr_write on ingestion_label_rules;
create policy ilr_write on ingestion_label_rules for all
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id() and auth_is_admin());

-- Classification the ingestion pipeline stamps on an incoming item. Fail-closed:
-- the org default is a floor and the most restrictive matching rule wins; tags
-- from every match are applied. The `sensitivity` enum is declared least →
-- most restrictive, so max() over it is the most restrictive level.
-- Mirrors src/lib/ingestionPolicy.ts:labelIngestedItem.
create or replace function ingestion_label_for(
  p_org_id       uuid,
  p_provider     text,
  p_content_kind text,
  p_text         text default '',
  p_from_address text default null
)
returns table (sensitivity sensitivity, tag_ids uuid[], matched_rule_ids uuid[])
language sql stable security definer set search_path = public as $$
  with org_default as (
    select coalesce(
      (o.settings->>'default_classification')::sensitivity,
      'internal'::sensitivity
    ) as s
    from organizations o where o.id = p_org_id
  ),
  sender as (
    select lower(split_part(coalesce(p_from_address, ''), '@', 2)) as domain
  ),
  matched as (
    select r.*
    from ingestion_label_rules r, sender s
    where r.org_id = p_org_id
      and r.enabled
      and (r.provider is null or r.provider = p_provider)
      and (r.content_kind is null or r.content_kind = p_content_kind)
      and (
        r.match_type = 'all'
        or (r.match_type = 'keyword' and coalesce(p_text, '') ilike '%' || r.match_value || '%')
        -- Exact domain or a subdomain of it, so a rule for "client.com" does
        -- not also catch "notclient.com".
        or (
          r.match_type = 'from_domain'
          and s.domain <> ''
          and (
            s.domain = lower(ltrim(r.match_value, '@'))
            or s.domain like '%.' || lower(ltrim(r.match_value, '@'))
          )
        )
      )
  )
  select
    greatest(
      (select s from org_default),
      coalesce((select max(m.sensitivity) from matched m), 'public'::sensitivity)
    ),
    coalesce((select array_agg(distinct tid) from matched m, unnest(m.tag_ids) tid), '{}'::uuid[]),
    coalesce((select array_agg(m.id order by m.sort_order) from matched m), '{}'::uuid[]);
$$;

-- RLS: fold the tag audience into the read policies. These REPLACE the existing
-- select policies (0002_rls.sql / 0004_governance.sql) — permissive policies are
-- OR'd, so the tag gate has to be AND'ed inside the single select policy rather
-- than added alongside it, or it would widen access instead of narrowing it.
drop policy if exists commitments_select on commitments;
create policy commitments_select on commitments for select
  using (
    org_id = auth_org_id()
    and auth_tag_access(tag_ids)
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

drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings for select
  using (
    org_id = auth_org_id()
    and auth_tag_access(tag_ids)
    and (auth_is_admin() or sensitivity_rank(sensitivity) <= auth_clearance())
  );

drop policy if exists projects_select on projects;
create policy projects_select on projects for select
  using (
    org_id = auth_org_id()
    and auth_tag_access(tag_ids)
    and (auth_is_admin() or sensitivity_rank(sensitivity) <= auth_clearance())
  );
