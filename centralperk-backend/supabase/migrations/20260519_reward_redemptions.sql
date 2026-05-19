create table if not exists public.reward_redemptions (
  id bigserial primary key,
  member_identifier text not null,
  fallback_email text,
  reward_catalog_id bigint not null references public.rewards_catalog(id) on delete restrict,
  points integer not null,
  reason text not null,
  status text not null default 'redeemed',
  promotion_campaign_id text,
  idempotency_key text unique,
  points_result jsonb,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint reward_redemptions_points_check check (points > 0),
  constraint reward_redemptions_status_check check (status in ('redeemed', 'cancelled', 'reversed'))
);

alter table public.reward_redemptions
  add column if not exists member_identifier text,
  add column if not exists fallback_email text,
  add column if not exists reward_catalog_id bigint,
  add column if not exists points integer,
  add column if not exists reason text,
  add column if not exists status text default 'redeemed',
  add column if not exists promotion_campaign_id text,
  add column if not exists idempotency_key text,
  add column if not exists points_result jsonb,
  add column if not exists redeemed_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

create unique index if not exists idx_reward_redemptions_idempotency_key
  on public.reward_redemptions(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_reward_redemptions_member_identifier
  on public.reward_redemptions(member_identifier);

create index if not exists idx_reward_redemptions_reward_catalog_id
  on public.reward_redemptions(reward_catalog_id);

create index if not exists idx_reward_redemptions_redeemed_at
  on public.reward_redemptions(redeemed_at desc);
