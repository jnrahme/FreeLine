create table if not exists calls (
  id text primary key,
  provider_call_id text not null unique,
  user_id text not null references users(id) on delete cascade,
  phone_number_id text not null references phone_numbers(id) on delete cascade,
  remote_number text not null,
  direction text not null,
  status text not null,
  duration_seconds integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calls_user_created_at
  on calls(user_id, created_at desc);

create index if not exists idx_calls_provider_call_id
  on calls(provider_call_id);
