-- Apply the reward_partner_* tables in the Reward Service Supabase project.
create table if not exists public.reward_partner_transactions (
  id text primary key,
  partner_id text not null,
  partner_code text not null,
  partner_name text not null,
  member_id text not null,
  member_email text,
  order_id text not null,
  points integer not null default 0 check (points >= 0),
  gross_amount numeric(12,2) not null default 0 check (gross_amount >= 0),
  note text not null default '',
  fulfillment_method text not null default 'in-store' check (fulfillment_method in ('in-store', 'online')),
  delivery_partner text,
  delivery_address text,
  delivery_notes text,
  contact_number text,
  occurred_at timestamptz not null default now(),
  settlement_id text,
  settled_at timestamptz,
  unique (partner_id, order_id)
);

create table if not exists public.reward_partner_settlements (
  id text primary key,
  partner_id text not null,
  partner_code text not null,
  partner_name text not null,
  total_transactions integer not null default 0 check (total_transactions >= 0),
  total_points integer not null default 0 check (total_points >= 0),
  total_gross_amount numeric(12,2) not null default 0 check (total_gross_amount >= 0),
  commission_rate numeric(8,6) not null default 0 check (commission_rate >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  created_at timestamptz not null default now(),
  transaction_ids jsonb not null default '[]'::jsonb
);

create index if not exists idx_reward_partner_transactions_partner_id on public.reward_partner_transactions(partner_id);
create index if not exists idx_reward_partner_transactions_member_id on public.reward_partner_transactions(member_id);
create index if not exists idx_reward_partner_transactions_settlement_id on public.reward_partner_transactions(settlement_id);
create index if not exists idx_reward_partner_settlements_partner_id on public.reward_partner_settlements(partner_id);

-- Apply the member_* tables below in the Member Service Supabase project.
create table if not exists public.member_referrals (
  id text primary key,
  referrer_member_id text not null,
  referrer_member_number text not null,
  referrer_code text not null,
  referee_email text not null,
  referee_member_id text,
  referee_member_number text,
  status text not null default 'pending' check (status in ('pending', 'joined')),
  bonus_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  unique (referrer_code, referee_email)
);

alter table public.member_referrals add column if not exists id text;
alter table public.member_referrals add column if not exists referrer_member_id text;
alter table public.member_referrals add column if not exists referrer_member_number text;
alter table public.member_referrals add column if not exists referrer_code text;
alter table public.member_referrals add column if not exists referee_email text;
alter table public.member_referrals add column if not exists referee_member_id text;
alter table public.member_referrals add column if not exists referee_member_number text;
alter table public.member_referrals add column if not exists status text default 'pending';
alter table public.member_referrals add column if not exists bonus_awarded boolean default false;
alter table public.member_referrals add column if not exists created_at timestamptz default now();
alter table public.member_referrals add column if not exists converted_at timestamptz;

create table if not exists public.member_feedback (
  id text primary key,
  member_id text not null,
  member_number text not null,
  member_name text not null,
  category text not null check (category in ('points', 'rewards', 'service', 'app')),
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  contact_opt_in boolean not null default false,
  contact_info text,
  created_at timestamptz not null default now()
);

alter table public.member_feedback add column if not exists id text;
alter table public.member_feedback add column if not exists member_id text;
alter table public.member_feedback add column if not exists member_number text;
alter table public.member_feedback add column if not exists member_name text;
alter table public.member_feedback add column if not exists category text;
alter table public.member_feedback add column if not exists rating integer;
alter table public.member_feedback add column if not exists comment text;
alter table public.member_feedback add column if not exists contact_opt_in boolean default false;
alter table public.member_feedback add column if not exists contact_info text;
alter table public.member_feedback add column if not exists created_at timestamptz default now();

create table if not exists public.member_birthday_reward_settings (
  id text primary key default 'global',
  amounts jsonb not null default '{"Bronze":100,"Silver":500,"Gold":1000}'::jsonb,
  release_timing text not null default 'first_day_of_birthday_month',
  fulfillment_mode text not null default 'auto_credit',
  claim_window text not null default 'birthday_month_only',
  updated_at timestamptz not null default now()
);

alter table public.member_birthday_reward_settings add column if not exists id text;
alter table public.member_birthday_reward_settings add column if not exists amounts jsonb default '{"Bronze":100,"Silver":500,"Gold":1000}'::jsonb;
alter table public.member_birthday_reward_settings add column if not exists release_timing text default 'first_day_of_birthday_month';
alter table public.member_birthday_reward_settings add column if not exists fulfillment_mode text default 'auto_credit';
alter table public.member_birthday_reward_settings add column if not exists claim_window text default 'birthday_month_only';
alter table public.member_birthday_reward_settings add column if not exists updated_at timestamptz default now();

insert into public.member_birthday_reward_settings (id)
select 'global'
where not exists (
  select 1 from public.member_birthday_reward_settings where id = 'global'
);

create table if not exists public.member_birthday_rewards (
  id text primary key,
  member_id text not null,
  member_number text not null,
  reward_year integer not null,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  voucher_code text,
  badge_label text,
  claimed_at timestamptz not null default now(),
  unique (member_number, reward_year)
);

alter table public.member_birthday_rewards add column if not exists id text;
alter table public.member_birthday_rewards add column if not exists member_id text;
alter table public.member_birthday_rewards add column if not exists member_number text;
alter table public.member_birthday_rewards add column if not exists reward_year integer;
alter table public.member_birthday_rewards add column if not exists points_awarded integer default 0;
alter table public.member_birthday_rewards add column if not exists voucher_code text;
alter table public.member_birthday_rewards add column if not exists badge_label text;
alter table public.member_birthday_rewards add column if not exists claimed_at timestamptz default now();

create table if not exists public.member_tier_history (
  id text primary key,
  member_id text not null,
  member_number text not null,
  old_tier text,
  new_tier text not null,
  changed_at timestamptz not null default now(),
  reason text
);

alter table public.member_tier_history add column if not exists id text;
alter table public.member_tier_history add column if not exists member_id text;
alter table public.member_tier_history add column if not exists member_number text;
alter table public.member_tier_history add column if not exists old_tier text;
alter table public.member_tier_history add column if not exists new_tier text;
alter table public.member_tier_history add column if not exists changed_at timestamptz default now();
alter table public.member_tier_history add column if not exists reason text;

create table if not exists public.member_badges (
  id text primary key,
  badge_code text not null unique,
  badge_name text not null,
  description text not null default '',
  icon_name text not null default 'Award',
  milestone_type text not null default 'activity',
  milestone_target integer not null default 0 check (milestone_target >= 0)
);

alter table public.member_badges add column if not exists id text;
alter table public.member_badges add column if not exists badge_code text;
alter table public.member_badges add column if not exists badge_name text;
alter table public.member_badges add column if not exists description text default '';
alter table public.member_badges add column if not exists icon_name text default 'Award';
alter table public.member_badges add column if not exists milestone_type text default 'activity';
alter table public.member_badges add column if not exists milestone_target integer default 0;

create table if not exists public.member_badge_awards (
  id text primary key,
  member_id text not null,
  member_number text not null,
  badge_id text not null references public.member_badges(id) on delete cascade,
  progress_value integer not null default 0 check (progress_value >= 0),
  earned_at timestamptz,
  unique (member_number, badge_id)
);

alter table public.member_badge_awards add column if not exists id text;
alter table public.member_badge_awards add column if not exists member_id text;
alter table public.member_badge_awards add column if not exists member_number text;
alter table public.member_badge_awards add column if not exists badge_id text;
alter table public.member_badge_awards add column if not exists progress_value integer default 0;
alter table public.member_badge_awards add column if not exists earned_at timestamptz;

create index if not exists idx_member_referrals_referrer on public.member_referrals(referrer_member_number);
create index if not exists idx_member_referrals_code on public.member_referrals(referrer_code);
create index if not exists idx_member_feedback_member on public.member_feedback(member_number);
create index if not exists idx_member_birthday_rewards_member on public.member_birthday_rewards(member_number);
create index if not exists idx_member_tier_history_member on public.member_tier_history(member_number);
create index if not exists idx_member_badge_awards_member on public.member_badge_awards(member_number);
