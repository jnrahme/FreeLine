create table if not exists phone_numbers (
  id text primary key,
  phone_number text not null unique,
  external_id text not null,
  provider text not null,
  area_code text not null,
  locality text not null,
  region text not null,
  national_format text not null,
  status text not null default 'assigned',
  quarantine_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_phone_numbers_status on phone_numbers(status);

create table if not exists number_assignments (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  phone_number_id text not null references phone_numbers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  activation_deadline timestamptz not null
);

create unique index if not exists idx_number_assignments_active_user
  on number_assignments(user_id)
  where released_at is null;

create unique index if not exists idx_number_assignments_active_phone
  on number_assignments(phone_number_id)
  where released_at is null;
