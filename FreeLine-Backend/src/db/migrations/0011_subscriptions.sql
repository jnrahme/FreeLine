create table if not exists subscription_entitlements (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  entitlement_key text not null,
  provider text not null,
  source_product_id text not null,
  transaction_id text not null,
  status text not null default 'active',
  expires_at timestamptz,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, entitlement_key)
);

create index if not exists idx_subscription_entitlements_user_status
  on subscription_entitlements(user_id, status, verified_at desc);
