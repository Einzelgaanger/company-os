-- Project room: topics, threaded messages, and one file list per project.

create table if not exists project_channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists project_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  channel_id  uuid not null references project_channels(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  body        text not null,
  parent_id   uuid references project_messages(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists project_messages_channel_idx on project_messages(channel_id, created_at);

create table if not exists project_files (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null check (kind in ('file', 'link', 'image')),
  name        text not null,
  url         text not null,
  added_by    uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists project_files_project_idx on project_files(project_id, created_at desc);

alter table project_channels enable row level security;
alter table project_messages enable row level security;
alter table project_files enable row level security;

create policy project_channels_org on project_channels
  for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
create policy project_messages_org on project_messages
  for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
create policy project_files_org on project_files
  for all using (org_id = auth_org_id()) with check (org_id = auth_org_id());
