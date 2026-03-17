create table if not exists admin_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invite_codes (
  id text primary key,
  code text not null unique,
  max_uses integer not null,
  current_uses integer not null default 0,
  expires_at timestamptz,
  created_by_admin_id text references admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_verifications
  add column if not exists invite_code_id text references invite_codes(id) on delete set null;

create index if not exists idx_invite_codes_expires_at
  on invite_codes(expires_at);
