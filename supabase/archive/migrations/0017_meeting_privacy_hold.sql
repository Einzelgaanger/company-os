-- Whole-call privacy gate.
-- A connected app delivers a meeting as one batch. It stays held
-- (privacy_held = true) until a person tags the call; extraction and live
-- use wait on that. Existing processed rows stay live (default false).

alter table meetings
  add column if not exists privacy_held boolean not null default false,
  add column if not exists transcript_text text,
  add column if not exists classified_by text;

comment on column meetings.privacy_held is
  'True until a person tags the whole call. Extraction and live storage wait on that.';

create index if not exists meetings_held_idx
  on meetings(org_id)
  where privacy_held = true;

-- Held calls still contain the raw transcript and have no audience yet, so
-- only managers/admins may see them. Released calls keep the existing
-- sensitivity + tag-audience gate.
drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings for select
  using (
    org_id = auth_org_id()
    and (
      (
        privacy_held
        and (auth_is_admin() or auth_role() in ('admin', 'manager', 'owner'))
      )
      or (
        not privacy_held
        and auth_tag_access(tag_ids)
        and (auth_is_admin() or sensitivity_rank(sensitivity) <= auth_clearance())
      )
    )
  );
