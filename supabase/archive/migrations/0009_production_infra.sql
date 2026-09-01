-- Production infrastructure: OTP persistence, calendar sync, Fathom registry, report PDF refs.

-- Phone OTP (service-role only; never exposed via RLS to clients)
create table if not exists phone_otp_codes (
  user_id       uuid primary key references users(id) on delete cascade,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      int not null default 0,
  created_at    timestamptz not null default now()
);
alter table phone_otp_codes enable row level security;
comment on table phone_otp_codes is 'Hashed WhatsApp OTP codes for phone verification. Edge functions only.';

-- Calendar metadata sync (titles/times only — no descriptions per spec)
create table if not exists calendar_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  connection_id uuid references connections(id) on delete cascade,
  external_id   text not null,
  title         text not null,
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_recurring  boolean not null default false,
  synced_at     timestamptz not null default now(),
  unique (org_id, connection_id, external_id)
);
create index if not exists calendar_events_org_idx on calendar_events(org_id);
alter table calendar_events enable row level security;

-- Fathom webhook endpoints per org
create table if not exists fathom_webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  webhook_id    text not null unique,
  secret_hash   text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists fathom_webhook_endpoints_org_idx on fathom_webhook_endpoints(org_id);
alter table fathom_webhook_endpoints enable row level security;

-- Report PDF delivery refs
alter table reports add column if not exists pdf_url text;
alter table reports add column if not exists pdf_sha256 text;

-- OAuth connection upsert key
create unique index if not exists connections_org_provider_user_uidx
  on connections (org_id, provider, (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)));

-- Slack / Teams webhook registry (ingestion-only connectors)
create table if not exists chat_webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  provider      text not null check (provider in ('slack','teams','zoom')),
  webhook_id    text not null,
  secret_hash   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, provider, webhook_id)
);
alter table chat_webhook_endpoints enable row level security;
