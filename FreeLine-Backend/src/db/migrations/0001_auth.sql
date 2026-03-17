create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  display_name text,
  trust_score integer not null default 50,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_identities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  password_hash text,
  created_at timestamptz not null default now(),
  unique(provider, provider_id)
);

create table if not exists devices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  fingerprint text not null,
  platform text not null,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, fingerprint)
);

create index if not exists idx_devices_fingerprint on devices(fingerprint);

create table if not exists email_verifications (
  id text primary key,
  user_id text references users(id) on delete cascade,
  email text not null,
  password_hash text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
