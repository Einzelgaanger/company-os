-- Telegram messaging: link Company OS users to Telegram chat IDs.

alter table users add column if not exists telegram_chat_id text;
alter table users add column if not exists telegram_username text;
alter table users add column if not exists telegram_linked_at timestamptz;

create unique index if not exists users_telegram_chat_id_uidx
  on users (telegram_chat_id)
  where telegram_chat_id is not null;

comment on column users.telegram_chat_id is 'Telegram chat id for Company OS bot outbound/inbound.';
comment on column users.telegram_username is 'Optional Telegram @username at link time.';
comment on column users.telegram_linked_at is 'When the user linked Telegram via LINK +phone.';
