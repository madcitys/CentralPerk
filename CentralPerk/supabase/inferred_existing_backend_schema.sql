-- Inferred Existing Backend Schema (Reference)
-- Purpose:
-- - SQL baseline for tables/columns already used by frontend code.
-- - Use this only if your central Supabase is missing these tables/columns.
--
-- NOTE:
-- - This is inferred from app queries/hooks, not exported directly from your live DB.
-- - Safe to run with IF NOT EXISTS patterns.

begin;

create table if not exists public.loyalty_members (
  id bigserial primary key,
  member_id bigint,
  member_number text unique not null,
  first_name text,
  last_name text,
  email text unique not null,
  phone text,
  points_balance integer not null default 0,
  tier text not null default 'Bronze',
  enrollment_date date default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  transaction_id bigint,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  transaction_type text not null,
  points integer not null,
  amount_spent numeric(12,2),
  reason text,
  receipt_id text,
  transaction_date timestamptz not null default now(),
  expiry_date timestamptz
);

create table if not exists public.points_rules (
  id bigserial primary key,
  tier_label text unique not null,
  min_points integer not null,
  is_active boolean not null default true
);

create table if not exists public.rewards_catalog (
  id bigserial primary key,
  reward_id text unique not null,
  name text not null,
  description text not null default '',
  points_cost integer not null check (points_cost >= 0),
  category text not null check (category in ('food','beverage','merchandise','voucher')),
  image_url text,
  is_active boolean not null default true,
  expiry_date timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.earn_tasks (
  id bigserial primary key,
  task_code text unique not null,
  title text not null,
  description text not null default '',
  points integer not null check (points >= 0),
  icon_key text not null default 'user',
  default_completed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','customer')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_loyalty_members_email on public.loyalty_members(lower(email));
create index if not exists idx_loyalty_members_member_number on public.loyalty_members(member_number);
create index if not exists idx_loyalty_transactions_member_id on public.loyalty_transactions(member_id);
create index if not exists idx_loyalty_transactions_date on public.loyalty_transactions(transaction_date desc);
create index if not exists idx_loyalty_transactions_type on public.loyalty_transactions(transaction_type);
create index if not exists idx_rewards_catalog_active on public.rewards_catalog(is_active);
create index if not exists idx_earn_tasks_active on public.earn_tasks(is_active);

insert into public.points_rules (tier_label, min_points, is_active)
values
  ('Gold', 750, true),
  ('Silver', 250, true),
  ('Bronze', 0, true)
on conflict (tier_label) do update
set min_points = excluded.min_points,
    is_active = excluded.is_active;

commit;

