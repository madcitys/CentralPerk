create table if not exists public.points_idempotency (
  id text primary key default gen_random_uuid()::text,
  route text not null,
  key text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (route, key)
);

create index if not exists idx_points_idempotency_created_at
  on public.points_idempotency(created_at desc);
