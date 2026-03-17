create table if not exists abuse_event_reviews (
  id text primary key,
  abuse_event_id text not null unique references abuse_events(id) on delete cascade,
  admin_user_id text not null references admin_users(id) on delete cascade,
  action text not null,
  notes text,
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_abuse_event_reviews_reviewed_at
  on abuse_event_reviews(reviewed_at desc);
