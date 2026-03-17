alter table number_assignments
  add column if not exists last_activity_at timestamptz;

alter table number_assignments
  add column if not exists release_reason text;

create index if not exists idx_number_assignments_activation_deadline
  on number_assignments(activation_deadline)
  where released_at is null;

create index if not exists idx_number_assignments_last_activity
  on number_assignments(last_activity_at)
  where released_at is null;

create table if not exists number_warnings (
  id text primary key,
  assignment_id text not null references number_assignments(id) on delete cascade,
  warning_type text not null,
  activity_anchor_at timestamptz not null,
  warned_at timestamptz not null default now()
);

create unique index if not exists idx_number_warnings_unique_anchor
  on number_warnings(assignment_id, warning_type, activity_anchor_at);

create table if not exists number_quarantine (
  id text primary key,
  assignment_id text not null references number_assignments(id) on delete cascade,
  phone_number_id text not null references phone_numbers(id) on delete cascade,
  phone_number text not null,
  reason text not null,
  reclaimed_at timestamptz not null default now(),
  available_at timestamptz not null,
  status text not null default 'quarantined',
  restored_at timestamptz,
  restored_to_user_id text references users(id) on delete set null,
  released_to_inventory_at timestamptz
);

create index if not exists idx_number_quarantine_status_available
  on number_quarantine(status, available_at);
