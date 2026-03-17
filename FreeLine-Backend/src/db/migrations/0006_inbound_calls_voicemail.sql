create table if not exists call_push_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  device_id text not null,
  platform text not null,
  channel text not null,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, device_id, platform, channel)
);

create index if not exists idx_call_push_tokens_user_channel
  on call_push_tokens(user_id, channel, updated_at desc);

create table if not exists voicemails (
  id text primary key,
  provider_call_id text not null unique,
  user_id text not null references users(id) on delete cascade,
  phone_number_id text not null references phone_numbers(id) on delete cascade,
  caller_number text not null,
  audio_url text not null,
  duration_seconds integer not null default 0,
  transcription text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_voicemails_user_created_at
  on voicemails(user_id, created_at desc);
