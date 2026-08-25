-- Platform secrets for edge functions (OpenRouter, etc.) when Deno env is empty.
-- Service role / edge only — no client RLS access.

create table if not exists app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table app_secrets enable row level security;

-- No policies for authenticated/anon → only service_role bypasses RLS.
drop policy if exists app_secrets_deny_all on app_secrets;

comment on table app_secrets is 'Platform API keys for Loop edge functions. Never expose to clients.';
