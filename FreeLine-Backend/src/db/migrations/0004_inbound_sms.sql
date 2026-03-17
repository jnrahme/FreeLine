create table if not exists push_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  device_id text not null,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_push_tokens_user_device_platform
  on push_tokens(user_id, device_id, platform);

create table if not exists blocks (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  blocked_number text not null,
  created_at timestamptz not null default now(),
  unique(user_id, blocked_number)
);

create table if not exists reports (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  reported_number text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists opt_out_events (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  participant_number text not null,
  keyword text not null,
  created_at timestamptz not null default now()
);
