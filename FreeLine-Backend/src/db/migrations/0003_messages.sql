create table if not exists conversations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  phone_number_id text not null references phone_numbers(id) on delete cascade,
  participant_number text not null,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  is_opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_conversations_user_phone_participant
  on conversations(user_id, phone_number_id, participant_number);

create index if not exists idx_conversations_user_last_message
  on conversations(user_id, last_message_at desc nulls last);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  direction text not null,
  body text not null,
  status text not null,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_messages_provider_message_id
  on messages(provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_messages_conversation_created_at
  on messages(conversation_id, created_at);

create table if not exists message_media (
  id text primary key,
  message_id text not null references messages(id) on delete cascade,
  media_url text not null,
  content_type text not null,
  created_at timestamptz not null default now()
);
