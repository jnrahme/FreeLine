create table if not exists abuse_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_abuse_events_user_created
  on abuse_events(user_id, created_at desc);

create table if not exists reward_claims (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  reward_type text not null,
  reward_amount integer not null,
  month_key text not null,
  claimed_at timestamptz not null default now()
);

create index if not exists idx_reward_claims_user_month
  on reward_claims(user_id, month_key, claimed_at desc);

create table if not exists device_accounts (
  id text primary key,
  fingerprint text not null,
  user_id text not null references users(id) on delete cascade,
  platform text not null,
  blocked_at timestamptz,
  blocked_reason text,
  admin_override_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(fingerprint, user_id)
);

create index if not exists idx_device_accounts_fingerprint
  on device_accounts(fingerprint);

create index if not exists idx_device_accounts_user
  on device_accounts(user_id);

create table if not exists rate_limit_buckets (
  id text primary key,
  user_id text references users(id) on delete cascade,
  bucket_key text not null,
  bucket_scope text not null,
  window_key text not null,
  used_count integer not null,
  limit_count integer not null,
  reset_at timestamptz not null,
  last_outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket_key, window_key)
);

create index if not exists idx_rate_limit_buckets_user_scope
  on rate_limit_buckets(user_id, bucket_scope, updated_at desc);
