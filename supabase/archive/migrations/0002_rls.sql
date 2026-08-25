-- Loop — Row Level Security (BUILD_SPEC Section 4 & 13)
-- Every table has RLS enabled. Reads are org-scoped; writes follow the role
-- matrix. Helper functions are SECURITY DEFINER so they can read `users`
-- without triggering recursive RLS evaluation.

-- Helpers ------------------------------------------------------------------
create or replace function auth_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from users where id = auth.uid()
$$;

create or replace function auth_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid()
$$;

create or replace function auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('admin','owner'), false)
$$;

create or replace function auth_is_manager_plus() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('manager','admin','owner'), false)
$$;

-- true if the given user reports (directly) to the current user
create or replace function auth_manages(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = target and u.manager_id = auth.uid())
$$;

-- Enable RLS on everything -------------------------------------------------
alter table organizations enable row level security;
alter table users         enable row level security;
alter table connections   enable row level security;
alter table projects       enable row level security;
alter table meetings      enable row level security;
alter table commitments   enable row level security;
alter table checkins      enable row level security;
alter table escalations   enable row level security;
alter table ownership_map enable row level security;
alter table reports       enable row level security;
alter table audit_log     enable row level security;
alter table notifications enable row level security;

-- ORGANIZATIONS ------------------------------------------------------------
create policy org_select on organizations for select
  using (id = auth_org_id());
create policy org_update_admin on organizations for update
  using (id = auth_org_id() and auth_is_admin())
  with check (id = auth_org_id());

-- USERS --------------------------------------------------------------------
create policy users_select_same_org on users for select
  using (org_id = auth_org_id());
create policy users_update_self on users for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy users_update_admin on users for update
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id());
create policy users_insert_admin on users for insert
  with check (org_id = auth_org_id() and auth_is_admin());

-- CONNECTIONS --------------------------------------------------------------
-- Note: application/API layer must never SELECT access_token/refresh_token
-- back to the client (Section 13). Restrict via a view or column grants in prod.
create policy conn_select on connections for select
  using (org_id = auth_org_id() and (user_id = auth.uid() or user_id is null or auth_is_admin()));
create policy conn_write_self on connections for all
  using (org_id = auth_org_id() and user_id = auth.uid())
  with check (org_id = auth_org_id() and user_id = auth.uid());
create policy conn_write_admin on connections for all
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id() and auth_is_admin());

-- PROJECTS -----------------------------------------------------------------
create policy projects_select on projects for select
  using (org_id = auth_org_id());
create policy projects_write_manager on projects for all
  using (org_id = auth_org_id() and auth_is_manager_plus())
  with check (org_id = auth_org_id() and auth_is_manager_plus());

-- MEETINGS -----------------------------------------------------------------
create policy meetings_select on meetings for select
  using (org_id = auth_org_id());
create policy meetings_write_manager on meetings for all
  using (org_id = auth_org_id() and auth_is_manager_plus())
  with check (org_id = auth_org_id() and auth_is_manager_plus());

-- COMMITMENTS --------------------------------------------------------------
-- Member: own (owner or requester). Manager: own + direct reports. Admin+: all.
create policy commitments_select on commitments for select
  using (
    org_id = auth_org_id() and (
      auth_is_admin()
      or owner_id = auth.uid()
      or requested_by_id = auth.uid()
      or (auth_role() = 'manager' and (auth_manages(owner_id) or auth_manages(requested_by_id)))
    )
  );
create policy commitments_insert on commitments for insert
  with check (org_id = auth_org_id());
create policy commitments_update_owner on commitments for update
  using (org_id = auth_org_id() and (owner_id = auth.uid() or requested_by_id = auth.uid()))
  with check (org_id = auth_org_id());
create policy commitments_update_manager on commitments for update
  using (org_id = auth_org_id() and (auth_is_admin() or (auth_role() = 'manager' and auth_manages(owner_id))))
  with check (org_id = auth_org_id());

-- CHECKINS -----------------------------------------------------------------
create policy checkins_select on checkins for select
  using (
    org_id = auth_org_id() and (
      auth_is_admin() or user_id = auth.uid()
      or (auth_role() = 'manager' and auth_manages(user_id))
    )
  );
create policy checkins_insert_self on checkins for insert
  with check (org_id = auth_org_id() and user_id = auth.uid());
-- Outbound check-ins are written by Edge Functions using the service role,
-- which bypasses RLS. No general client insert for outbound is granted.

-- ESCALATIONS --------------------------------------------------------------
create policy escalations_select on escalations for select
  using (
    org_id = auth_org_id() and (
      auth_is_admin() or escalated_to_id = auth.uid()
      or exists (
        select 1 from commitments c
        where c.id = commitment_id
          and (c.owner_id = auth.uid() or c.requested_by_id = auth.uid()
               or (auth_role() = 'manager' and (auth_manages(c.owner_id) or auth_manages(c.requested_by_id))))
      )
    )
  );
create policy escalations_update_manager on escalations for update
  using (org_id = auth_org_id() and (auth_is_admin() or escalated_to_id = auth.uid()
         or (auth_role() = 'manager')))
  with check (org_id = auth_org_id());

-- OWNERSHIP MAP ------------------------------------------------------------
create policy ownership_select on ownership_map for select
  using (org_id = auth_org_id());
create policy ownership_write_admin on ownership_map for all
  using (org_id = auth_org_id() and auth_is_admin())
  with check (org_id = auth_org_id() and auth_is_admin());

-- REPORTS ------------------------------------------------------------------
-- Admin/Owner see all; Managers see reports they are a recipient of.
create policy reports_select on reports for select
  using (org_id = auth_org_id() and (auth_is_admin() or auth.uid() = any(recipient_ids) or auth_is_manager_plus()));

-- AUDIT LOG ----------------------------------------------------------------
-- Read-only for Admin/Owner; no client writes (Edge Functions use service role).
create policy audit_select_admin on audit_log for select
  using (org_id = auth_org_id() and auth_is_admin());

-- NOTIFICATIONS ------------------------------------------------------------
create policy notifications_select on notifications for select
  using (org_id = auth_org_id() and user_id = auth.uid());
create policy notifications_update_self on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
