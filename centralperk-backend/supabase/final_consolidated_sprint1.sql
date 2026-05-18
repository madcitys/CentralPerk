-- ============================================================
-- CENTRALPERK SPRINT 1 CONSOLIDATED SUPABASE SQL
-- Single authoritative file for the current project
-- Based on the current live schema shape plus verified Sprint 1 fixes
-- ============================================================

begin;

-- ============================================================
-- CORE TABLES
-- ============================================================

create table if not exists public.loyalty_members (
  id bigserial primary key,
  member_id bigint unique,
  member_number varchar(20) unique,
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique not null,
  phone varchar(20),
  birthdate date,
  points_balance int default 0,
  tier varchar(20) default 'Bronze',
  enrollment_date date default current_date,
  created_at timestamptz default now(),
  address text,
  profile_photo_url text
);

alter table public.loyalty_members
  add column if not exists manual_segment text,
  add column if not exists referral_code text,
  add column if not exists sms_enabled boolean not null default true,
  add column if not exists email_enabled boolean not null default true,
  add column if not exists push_enabled boolean not null default true,
  add column if not exists promotional_opt_in boolean not null default true,
  add column if not exists communication_frequency text not null default 'weekly';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_members_manual_segment_check'
      and conrelid = 'public.loyalty_members'::regclass
  ) then
    alter table public.loyalty_members
      add constraint loyalty_members_manual_segment_check
      check (manual_segment is null or manual_segment in ('High Value', 'Active', 'At Risk', 'Inactive'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_members_communication_frequency_check'
      and conrelid = 'public.loyalty_members'::regclass
  ) then
    alter table public.loyalty_members
      add constraint loyalty_members_communication_frequency_check
      check (communication_frequency in ('daily', 'weekly', 'never'));
  end if;
end $$;

create extension if not exists pgcrypto;

create table if not exists public.member_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_segments_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists member_segments_name_lower_uniq
  on public.member_segments ((lower(trim(name))));

create table if not exists public.member_segment_assignments (
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  segment_id uuid not null references public.member_segments(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (member_id, segment_id)
);

create index if not exists member_segment_assignments_segment_idx
  on public.member_segment_assignments (segment_id, assigned_at desc);

create or replace function public.set_member_segments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_member_segments_updated_at on public.member_segments;
create trigger trg_member_segments_updated_at
before update on public.member_segments
for each row
execute function public.set_member_segments_updated_at();

insert into public.member_segments (name, description, is_system)
values
  ('High Value', 'System-defined high value members', true),
  ('Active', 'System-defined active members', true),
  ('At Risk', 'System-defined at-risk members', true),
  ('Inactive', 'System-defined inactive members', true)
on conflict ((lower(trim(name)))) do update
set is_system = excluded.is_system,
    updated_at = now();

insert into public.member_segment_assignments (member_id, segment_id)
select m.id, s.id
from public.loyalty_members m
join public.member_segments s
  on lower(trim(s.name)) = lower(trim(m.manual_segment))
where m.manual_segment is not null
on conflict (member_id, segment_id) do nothing;

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('admin', 'customer')),
  updated_at timestamptz default now()
);

create table if not exists public.points_rules (
  id bigserial primary key,
  tier_label varchar(20) unique not null,
  min_points integer not null,
  is_active boolean default true
);

create table if not exists public.earning_rules (
  id bigserial primary key,
  tier_label varchar(20) not null,
  peso_per_point numeric(10, 2) not null,
  multiplier numeric(10, 2) not null default 1,
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint earning_rules_tier_label_check check (
    tier_label in ('Bronze', 'Silver', 'Gold')
  ),
  constraint earning_rules_peso_per_point_check check (peso_per_point > 0),
  constraint earning_rules_multiplier_check check (multiplier > 0)
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  transaction_id bigint unique,
  member_id bigint references public.loyalty_members(id) on delete cascade,
  transaction_type varchar(50),
  points integer not null,
  amount_spent numeric(10, 2) default 0,
  reason text,
  receipt_id text unique,
  transaction_date timestamptz default now(),
  expiry_date timestamptz default (now() + interval '1 year')
);

create table if not exists public.notification_outbox (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  channel text check (channel in ('email', 'sms', 'push')),
  subject text,
  message text,
  status text default 'pending',
  created_at timestamptz default now(),
  sent_at timestamptz
);

alter table public.notification_outbox
  add column if not exists is_promotional boolean not null default false;

create table if not exists public.member_feedback (
  id bigserial primary key,
  member_number text not null,
  member_name text not null,
  category text not null,
  rating integer not null,
  comment text not null,
  contact_opt_in boolean not null default false,
  contact_info text,
  created_at timestamptz not null default now(),
  constraint member_feedback_category_check check (category in ('points', 'rewards', 'service', 'app')),
  constraint member_feedback_rating_check check (rating between 1 and 5),
  constraint member_feedback_comment_length_check check (char_length(comment) <= 500)
);

create table if not exists public.member_referrals (
  id bigserial primary key,
  referrer_member_id bigint not null references public.loyalty_members(id) on delete cascade,
  referrer_code text not null,
  referee_email text not null,
  referee_email_normalized text generated always as (lower(trim(referee_email))) stored,
  referee_member_id bigint references public.loyalty_members(id) on delete set null,
  status text not null default 'pending',
  converted_at timestamptz,
  bonus_awarded boolean not null default false,
  referrer_bonus_txn_id bigint references public.loyalty_transactions(id) on delete set null,
  referee_bonus_txn_id bigint references public.loyalty_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint member_referrals_status_check check (status in ('pending', 'joined'))
);

create unique index if not exists uq_member_referrals_referrer_email
on public.member_referrals (referrer_member_id, referee_email_normalized);

create table if not exists public.member_birthday_rewards (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  reward_year integer not null,
  tier_at_award text not null,
  points_awarded integer not null,
  voucher_code text not null,
  voucher_expires_at date not null,
  source text not null default 'auto',
  created_at timestamptz not null default now(),
  constraint member_birthday_rewards_source_check check (source in ('auto', 'manual')),
  constraint member_birthday_rewards_unique_member_year unique (member_id, reward_year),
  constraint member_birthday_rewards_unique_voucher unique (voucher_code)
);

create table if not exists public.loyalty_member_profile_audit (
  id bigserial primary key,
  member_id bigint references public.loyalty_members(id),
  changed_by uuid references auth.users(id),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz default now()
);

create table if not exists public.points_lots (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  source_transaction_id bigint unique references public.loyalty_transactions(id) on delete set null,
  original_points integer not null check (original_points > 0),
  remaining_points integer not null check (remaining_points >= 0),
  earned_at timestamptz not null default now(),
  expiry_date timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards_catalog (
  id bigserial primary key,
  reward_id text unique not null,
  name text not null,
  description text,
  points_cost integer not null,
  category text,
  image_url text,
  is_active boolean default true,
  expiry_date timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.earn_tasks (
  id bigserial primary key,
  task_code text unique not null,
  title text not null,
  description text,
  points integer not null,
  icon_key text,
  default_completed boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.tier_history (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  old_tier varchar(20) not null,
  new_tier varchar(20) not null,
  changed_at timestamptz not null default now(),
  reason text
);

create table if not exists public.redemption_settings (
  id bigserial primary key,
  redemption_value_per_point numeric(12, 6) not null default 0.01,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.liability_snapshots (
  id bigserial primary key,
  snapshot_month date not null unique,
  total_unredeemed_points bigint not null,
  monetary_liability numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.member_login_activity (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  login_at timestamptz not null default now(),
  channel text not null default 'web',
  source text not null default 'customer_portal',
  created_at timestamptz not null default now(),
  constraint member_login_activity_channel_check check (
    channel in ('web', 'mobile', 'kiosk', 'system')
  )
);

create table if not exists public.member_reengagement_actions (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  initiated_by uuid references auth.users(id) on delete set null,
  risk_level text not null,
  action_type text not null,
  recommended_action text not null,
  action_notes text,
  status text not null default 'planned',
  success boolean,
  success_metric text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  follow_up_due_at timestamptz,
  constraint member_reengagement_actions_risk_level_check check (
    risk_level in ('Low', 'Medium', 'High')
  ),
  constraint member_reengagement_actions_status_check check (
    status in ('planned', 'sent', 'completed', 'dismissed')
  )
);

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update
set public = excluded.public;

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_members_email on public.loyalty_members(lower(email));
create index if not exists idx_members_member_number on public.loyalty_members(member_number);
create unique index if not exists idx_loyalty_members_phone_unique
on public.loyalty_members (phone)
where phone is not null and length(trim(phone)) > 0;
create unique index if not exists idx_loyalty_members_referral_code_unique
on public.loyalty_members (lower(referral_code))
where referral_code is not null and length(trim(referral_code)) > 0;

create index if not exists idx_transactions_member on public.loyalty_transactions(member_id);
create index if not exists idx_transactions_date on public.loyalty_transactions(transaction_date desc);
create index if not exists idx_rewards_catalog_active on public.rewards_catalog(is_active);
create index if not exists idx_earn_tasks_active on public.earn_tasks(is_active);
create unique index if not exists uq_earning_rules_single_active_per_tier
on public.earning_rules (tier_label)
where is_active = true;
create index if not exists idx_earning_rules_active_tier
on public.earning_rules (tier_label, is_active, effective_at desc);
create index if not exists idx_points_lots_member_fifo
on public.points_lots (member_id, expiry_date asc, earned_at asc, id asc)
where remaining_points > 0;
create index if not exists idx_tier_history_member_date
on public.tier_history (member_id, changed_at desc);
create index if not exists idx_notification_outbox_user_created
on public.notification_outbox (user_id, created_at desc);
create index if not exists idx_notification_outbox_status_created
on public.notification_outbox (status, created_at desc);
create index if not exists idx_notification_outbox_user_channel_promotional
on public.notification_outbox (user_id, channel, created_at desc)
where is_promotional = true;
create index if not exists idx_member_feedback_created
on public.member_feedback (created_at desc);
create index if not exists idx_member_login_activity_member_date
on public.member_login_activity (member_id, login_at desc);
create index if not exists idx_member_reengagement_actions_member_date
on public.member_reengagement_actions (member_id, created_at desc);
create index if not exists idx_member_reengagement_actions_status_date
on public.member_reengagement_actions (status, created_at desc);

-- ============================================================
-- SEED DATA
-- ============================================================

insert into public.points_rules (tier_label, min_points, is_active)
values
  ('Bronze', 0, true),
  ('Silver', 250, true),
  ('Gold', 750, true)
on conflict (tier_label) do update
set min_points = excluded.min_points,
    is_active = excluded.is_active;

insert into public.earning_rules (tier_label, peso_per_point, multiplier, is_active)
values
  ('Bronze', 10, 1.00, true),
  ('Silver', 10, 1.25, true),
  ('Gold', 10, 1.50, true)
on conflict do nothing;

insert into public.redemption_settings (redemption_value_per_point, is_active)
select 0.01, true
where not exists (
  select 1 from public.redemption_settings where is_active = true
);

insert into public.rewards_catalog (reward_id, name, description, points_cost, category, image_url, is_active, expiry_date)
values
  ('RW001', 'Free Regular Coffee', 'Any regular-sized hot or iced coffee', 120, 'beverage', 'https://images.unsplash.com/photo-1657048167114-0942f3a2dc93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW002', 'Free Pastry', 'Choose from croissant, muffin, or danish', 150, 'food', 'https://images.unsplash.com/photo-1751151856149-5ebf1d21586a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW003', 'Free Large Specialty Drink', 'Any large-sized specialty beverage', 280, 'beverage', 'https://images.unsplash.com/photo-1680381724318-c8ac9fe3a484?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW004', 'Breakfast Combo', 'Coffee + breakfast sandwich or wrap', 350, 'food', 'https://images.unsplash.com/photo-1738682585466-c287db5404de?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW005', 'Coffee Beans 250g', 'Premium roasted coffee beans', 500, 'merchandise', 'https://images.unsplash.com/photo-1561766858-62033ae40ec3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW006', 'ZUS Branded Tumbler', 'Reusable insulated tumbler - 16oz', 800, 'merchandise', 'https://images.unsplash.com/photo-1666447616947-cd26838cb88b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW007', '$10 Gift Voucher', 'Redeemable for any purchase', 1000, 'voucher', 'https://images.unsplash.com/photo-1637910116483-7efcc9480847?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW008', 'Monthly Coffee Pass', '30 days of free regular coffee', 2500, 'voucher', 'https://images.unsplash.com/photo-1683888046273-38c106471115?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, '2026-03-31T23:59:59Z')
on conflict (reward_id) do update
set
  name = excluded.name,
  description = excluded.description,
  points_cost = excluded.points_cost,
  category = excluded.category,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  expiry_date = excluded.expiry_date;

insert into public.earn_tasks (task_code, title, description, points, icon_key, default_completed, is_active)
values
  ('E001', 'Complete Your Profile', 'Add your birthday, phone number, and preferences', 100, 'user', true, true),
  ('E002', 'Download Mobile App', 'Get the ZUS Coffee app on your phone', 50, 'smartphone', true, true),
  ('E003', 'Monthly Survey', 'Share your feedback about our service', 50, 'clipboard', false, true),
  ('E004', 'Refer a Friend', 'Both get 250 points when they make first purchase', 250, 'users', false, true),
  ('E005', 'Follow on Social Media', 'Follow us on Instagram and Facebook', 30, 'share-2', false, true),
  ('E006', 'Leave a Review', 'Rate your experience on Google or App Store', 75, 'star', false, true)
on conflict (task_code) do update
set
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  icon_key = excluded.icon_key,
  default_completed = excluded.default_completed,
  is_active = excluded.is_active;

-- ============================================================
-- MEMBER NUMBER FIX (LYL-002)
-- ============================================================

create table if not exists public.member_number_counter (
  counter_name text primary key,
  last_value bigint not null
);

insert into public.member_number_counter (counter_name, last_value)
values (
  'member_number',
  coalesce(
    (
      select max(
        coalesce(nullif(regexp_replace(member_number, '\D', '', 'g'), ''), '0')::bigint
      )
      from public.loyalty_members
    ),
    0
  )
)
on conflict (counter_name) do update
set last_value = greatest(public.member_number_counter.last_value, excluded.last_value);

create or replace function public.loyalty_generate_member_number()
returns text
language plpgsql
as $$
declare
  seq_value bigint;
begin
  update public.member_number_counter
  set last_value = last_value + 1
  where counter_name = 'member_number'
  returning last_value into seq_value;

  if seq_value is null then
    insert into public.member_number_counter (counter_name, last_value)
    values ('member_number', 1)
    on conflict (counter_name) do update
    set last_value = public.member_number_counter.last_value + 1
    returning last_value into seq_value;
  end if;

  return 'MEM-' || lpad(seq_value::text, 6, '0');
end;
$$;

create or replace function public.set_member_number()
returns trigger
language plpgsql
as $$
begin
  if new.member_number is null then
    new.member_number := public.loyalty_generate_member_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_member_number on public.loyalty_members;
create trigger trg_member_number
before insert on public.loyalty_members
for each row
execute function public.set_member_number();

-- ============================================================
-- SUPPORT FUNCTIONS
-- ============================================================

create or replace function public.app_current_role()
returns text
language sql
stable
as $$
  select role from public.app_user_roles where user_id = auth.uid()
$$;

create or replace function public.app_current_email()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '')
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.app_current_role() = 'admin', false)
    or lower(public.app_current_email()) like '%@admin.loyaltyhub.com'
$$;

-- ============================================================
-- RLS AND STORAGE POLICIES
-- ============================================================

alter table public.loyalty_members disable row level security;
alter table public.member_login_activity disable row level security;
alter table public.member_reengagement_actions disable row level security;
alter table public.member_feedback disable row level security;

drop policy if exists loyalty_members_select_own on public.loyalty_members;
create policy loyalty_members_select_own
on public.loyalty_members
for select
to authenticated
using (
  public.app_current_role() = 'admin'
  or lower(email) = lower(public.app_current_email())
);

drop policy if exists loyalty_members_update_own on public.loyalty_members;
create policy loyalty_members_update_own
on public.loyalty_members
for update
to authenticated
using (
  public.app_current_role() = 'admin'
  or lower(email) = lower(public.app_current_email())
)
with check (
  public.app_current_role() = 'admin'
  or lower(email) = lower(public.app_current_email())
);

drop policy if exists member_login_activity_select on public.member_login_activity;
create policy member_login_activity_select
on public.member_login_activity
for select
to authenticated
using (
  public.app_is_admin()
  or exists (
    select 1
    from public.loyalty_members m
    where m.id = member_login_activity.member_id
      and lower(m.email) = lower(public.app_current_email())
  )
);

drop policy if exists member_login_activity_insert on public.member_login_activity;
create policy member_login_activity_insert
on public.member_login_activity
for insert
to authenticated
with check (
  public.app_is_admin()
  or exists (
    select 1
    from public.loyalty_members m
    where m.id = member_login_activity.member_id
      and lower(m.email) = lower(public.app_current_email())
  )
);

drop policy if exists member_reengagement_actions_select on public.member_reengagement_actions;
create policy member_reengagement_actions_select
on public.member_reengagement_actions
for select
to authenticated
using (
  public.app_is_admin()
  or exists (
    select 1
    from public.loyalty_members m
    where m.id = member_reengagement_actions.member_id
      and lower(m.email) = lower(public.app_current_email())
  )
);

drop policy if exists member_reengagement_actions_insert_admin on public.member_reengagement_actions;
create policy member_reengagement_actions_insert_admin
on public.member_reengagement_actions
for insert
to authenticated
with check (public.app_is_admin());

drop policy if exists member_reengagement_actions_update_admin on public.member_reengagement_actions;
create policy member_reengagement_actions_update_admin
on public.member_reengagement_actions
for update
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

drop policy if exists member_feedback_select on public.member_feedback;
create policy member_feedback_select
on public.member_feedback
for select
to authenticated
using (
  public.app_is_admin()
  or exists (
    select 1
    from public.loyalty_members m
    where m.member_number::text = member_feedback.member_number
      and lower(m.email) = lower(public.app_current_email())
  )
);

drop policy if exists member_feedback_insert on public.member_feedback;
create policy member_feedback_insert
on public.member_feedback
for insert
to authenticated
with check (
  public.app_is_admin()
  or exists (
    select 1
    from public.loyalty_members m
    where m.member_number::text = member_feedback.member_number
      and lower(m.email) = lower(public.app_current_email())
  )
);

drop policy if exists profile_photos_read on storage.objects;
create policy profile_photos_read
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-photos');

drop policy if exists profile_photos_insert on storage.objects;
create policy profile_photos_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'profile-photos');

drop policy if exists profile_photos_update on storage.objects;
create policy profile_photos_update
on storage.objects
for update
to authenticated
using (bucket_id = 'profile-photos')
with check (bucket_id = 'profile-photos');

create or replace function public.loyalty_resolve_tier(p_points int)
returns text
language plpgsql
stable
as $$
declare
  v_tier text;
begin
  select tier_label
  into v_tier
  from public.points_rules
  where is_active = true
    and p_points >= min_points
  order by min_points desc
  limit 1;

  return coalesce(v_tier, 'Bronze');
end;
$$;

create or replace function public.loyalty_member_segments()
returns table (
  member_id bigint,
  member_number text,
  auto_segment text,
  manual_segment text,
  effective_segment text,
  last_activity_at timestamptz
)
language sql
stable
as $$
  with latest_activity as (
    select
      t.member_id,
      max(t.transaction_date) as last_activity_at
    from public.loyalty_transactions t
    group by t.member_id
  ),
  system_manual as (
    select
      msa.member_id,
      max(msa.assigned_at) as last_assigned_at
    from public.member_segment_assignments msa
    join public.member_segments ms
      on ms.id = msa.segment_id
     and ms.is_system = true
    group by msa.member_id
  ),
  latest_system_manual as (
    select
      msa.member_id,
      ms.name as manual_segment
    from public.member_segment_assignments msa
    join public.member_segments ms
      on ms.id = msa.segment_id
     and ms.is_system = true
    join system_manual sm
      on sm.member_id = msa.member_id
     and sm.last_assigned_at = msa.assigned_at
  )
  select
    m.id as member_id,
    m.member_number::text as member_number,
    case
      when m.points_balance >= 2500 or (lower(coalesce(m.tier, 'bronze')) = 'gold' and m.points_balance >= 1200) then 'High Value'
      when coalesce((current_date - coalesce(la.last_activity_at::date, m.enrollment_date)), 99999) <= 30 then 'Active'
      when coalesce((current_date - coalesce(la.last_activity_at::date, m.enrollment_date)), 99999) <= 90 then 'At Risk'
      else 'Inactive'
    end as auto_segment,
    coalesce(lsm.manual_segment, m.manual_segment) as manual_segment,
    coalesce(
      lsm.manual_segment,
      m.manual_segment,
      case
        when m.points_balance >= 2500 or (lower(coalesce(m.tier, 'bronze')) = 'gold' and m.points_balance >= 1200) then 'High Value'
        when coalesce((current_date - coalesce(la.last_activity_at::date, m.enrollment_date)), 99999) <= 30 then 'Active'
        when coalesce((current_date - coalesce(la.last_activity_at::date, m.enrollment_date)), 99999) <= 90 then 'At Risk'
        else 'Inactive'
      end
    ) as effective_segment,
    la.last_activity_at
  from public.loyalty_members m
  left join latest_activity la on la.member_id = m.id
  left join latest_system_manual lsm on lsm.member_id = m.id;
$$;

create or replace function public.loyalty_assign_referral_code()
returns trigger
language plpgsql
as $$
begin
  update public.loyalty_members
  set referral_code = 'REF' || regexp_replace(coalesce(member_number, ''), '\D', '', 'g')
  where id = new.id
    and coalesce(trim(referral_code), '') = ''
    and coalesce(trim(member_number), '') <> '';
  return new;
end;
$$;

drop trigger if exists trg_loyalty_assign_referral_code on public.loyalty_members;
create trigger trg_loyalty_assign_referral_code
after insert on public.loyalty_members
for each row
execute function public.loyalty_assign_referral_code();

update public.loyalty_members
set referral_code = 'REF' || regexp_replace(coalesce(member_number, ''), '\D', '', 'g')
where coalesce(trim(referral_code), '') = ''
  and coalesce(trim(member_number), '') <> '';

create or replace function public.loyalty_create_referral_invite(
  p_referrer_member_number text,
  p_referee_email text
)
returns public.member_referrals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer public.loyalty_members%rowtype;
  v_referral public.member_referrals%rowtype;
begin
  select *
  into v_referrer
  from public.loyalty_members
  where member_number = p_referrer_member_number
  limit 1;

  if v_referrer is null then
    raise exception 'Referrer member not found';
  end if;

  if lower(coalesce(v_referrer.email, '')) = lower(trim(coalesce(p_referee_email, ''))) then
    raise exception 'Self-referral is not allowed';
  end if;

  insert into public.member_referrals (
    referrer_member_id,
    referrer_code,
    referee_email,
    status
  )
  values (
    v_referrer.id,
    v_referrer.referral_code,
    lower(trim(p_referee_email)),
    'pending'
  )
  on conflict (referrer_member_id, referee_email_normalized)
  do update set
    referrer_code = excluded.referrer_code
  returning * into v_referral;

  return v_referral;
end;
$$;

create or replace function public.loyalty_apply_referral(
  p_referral_code text,
  p_referee_member_number text,
  p_referee_email text
)
returns table (
  applied boolean,
  referral_id bigint,
  referrer_member_number text,
  referrer_points integer,
  referee_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer public.loyalty_members%rowtype;
  v_referee public.loyalty_members%rowtype;
  v_referral public.member_referrals%rowtype;
  v_referrer_tx_id bigint;
  v_referee_tx_id bigint;
begin
  select * into v_referrer
  from public.loyalty_members
  where lower(referral_code) = lower(trim(coalesce(p_referral_code, '')))
  limit 1;

  if v_referrer is null then
    return query select false, null::bigint, null::text, 0, 0;
    return;
  end if;

  select * into v_referee
  from public.loyalty_members
  where member_number = p_referee_member_number
     or lower(email) = lower(trim(coalesce(p_referee_email, '')))
  limit 1;

  if v_referee is null then
    return query select false, null::bigint, null::text, null::integer, null::integer;
    return;
  end if;

  if v_referrer.id = v_referee.id then
    return query select false, null::bigint, v_referrer.member_number::text, 0, 0;
    return;
  end if;

  insert into public.member_referrals (
    referrer_member_id,
    referrer_code,
    referee_email,
    referee_member_id,
    status,
    converted_at
  )
  values (
    v_referrer.id,
    v_referrer.referral_code,
    lower(trim(v_referee.email)),
    v_referee.id,
    'joined',
    now()
  )
  on conflict (referrer_member_id, referee_email_normalized)
  do update set
    referee_member_id = excluded.referee_member_id,
    status = 'joined',
    converted_at = coalesce(public.member_referrals.converted_at, now())
  returning * into v_referral;

  if coalesce(v_referral.bonus_awarded, false) = true then
    return query select true, v_referral.id, v_referrer.member_number::text, 0, 0;
    return;
  end if;

  insert into public.loyalty_transactions (member_id, transaction_type, points, reason, receipt_id)
  values (
    v_referrer.id,
    'MANUAL_AWARD',
    500,
    format('Referral bonus (referral #%s)', v_referral.id),
    format('REFERRAL-REFERRER-%s', v_referral.id)
  )
  on conflict (receipt_id) do nothing
  returning id into v_referrer_tx_id;

  insert into public.loyalty_transactions (member_id, transaction_type, points, reason, receipt_id)
  values (
    v_referee.id,
    'MANUAL_AWARD',
    200,
    format('Referral welcome bonus (referral #%s)', v_referral.id),
    format('REFERRAL-REFEREE-%s', v_referral.id)
  )
  on conflict (receipt_id) do nothing
  returning id into v_referee_tx_id;

  if v_referrer_tx_id is null then
    select id into v_referrer_tx_id
    from public.loyalty_transactions
    where receipt_id = format('REFERRAL-REFERRER-%s', v_referral.id)
    limit 1;
  end if;

  if v_referee_tx_id is null then
    select id into v_referee_tx_id
    from public.loyalty_transactions
    where receipt_id = format('REFERRAL-REFEREE-%s', v_referral.id)
    limit 1;
  end if;

  update public.member_referrals
  set bonus_awarded = (v_referrer_tx_id is not null and v_referee_tx_id is not null),
      referrer_bonus_txn_id = v_referrer_tx_id,
      referee_bonus_txn_id = v_referee_tx_id
  where id = v_referral.id;

  return query select true, v_referral.id, v_referrer.member_number::text, 500, 200;
end;
$$;

create or replace function public.loyalty_process_birthday_rewards(p_run_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from p_run_date)::integer;
  v_count integer := 0;
  v_points integer;
  v_voucher_code text;
  r record;
begin
  if extract(day from p_run_date)::integer <> 1 then
    return 0;
  end if;

  for r in
    select m.*
    from public.loyalty_members m
    where m.birthdate is not null
      and extract(month from m.birthdate)::integer = extract(month from p_run_date)::integer
      and not exists (
        select 1
        from public.member_birthday_rewards b
        where b.member_id = m.id
          and b.reward_year = v_year
      )
  loop
    v_points := case lower(coalesce(r.tier, 'bronze'))
      when 'gold' then 1000
      when 'silver' then 500
      else 100
    end;

    v_voucher_code := format('BDAY-%s-%s', v_year, lpad(r.id::text, 6, '0'));

    insert into public.member_birthday_rewards (
      member_id, reward_year, tier_at_award, points_awarded, voucher_code, voucher_expires_at, source
    )
    values (
      r.id, v_year, coalesce(r.tier, 'Bronze'), v_points, v_voucher_code, (p_run_date + interval '30 days')::date, 'auto'
    )
    on conflict (member_id, reward_year) do nothing;

    insert into public.loyalty_transactions (member_id, transaction_type, points, reason, receipt_id)
    values (
      r.id,
      'MANUAL_AWARD',
      v_points,
      format('Birthday reward (%s)', v_year),
      format('BIRTHDAY-%s-%s', v_year, r.id)
    )
    on conflict (receipt_id) do nothing;

    insert into public.notification_outbox (user_id, channel, subject, message, is_promotional)
    select
      u.id,
      'email',
      'Happy Birthday from Central Perk!',
      format(
        'Hi %s! Happy birthday month. We credited %s bonus points and unlocked voucher %s (valid until %s).',
        coalesce(r.first_name, 'Member'),
        v_points,
        v_voucher_code,
        (p_run_date + interval '30 days')::date
      ),
      false
    from auth.users u
    where lower(u.email) = lower(r.email)
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.loyalty_claim_birthday_reward(
  p_member_number text,
  p_fallback_email text default null
)
returns table (
  granted boolean,
  points_awarded integer,
  voucher_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.loyalty_members%rowtype;
  v_year integer := extract(year from current_date)::integer;
  v_points integer;
  v_voucher_code text;
begin
  select * into v_member
  from public.loyalty_members
  where member_number = p_member_number
     or (p_fallback_email is not null and lower(email) = lower(p_fallback_email))
  limit 1;

  if v_member is null or v_member.birthdate is null then
    return query select false, 0, null::text;
    return;
  end if;

  if extract(month from v_member.birthdate)::integer <> extract(month from current_date)::integer then
    return query select false, 0, null::text;
    return;
  end if;

  if exists (
    select 1 from public.member_birthday_rewards
    where member_id = v_member.id and reward_year = v_year
  ) then
    return query
    select true, b.points_awarded, b.voucher_code
    from public.member_birthday_rewards b
    where b.member_id = v_member.id and b.reward_year = v_year
    limit 1;
    return;
  end if;

  v_points := case lower(coalesce(v_member.tier, 'bronze'))
    when 'gold' then 1000
    when 'silver' then 500
    else 100
  end;
  v_voucher_code := format('BDAY-%s-%s', v_year, lpad(v_member.id::text, 6, '0'));

  insert into public.member_birthday_rewards (
    member_id, reward_year, tier_at_award, points_awarded, voucher_code, voucher_expires_at, source
  )
  values (
    v_member.id, v_year, coalesce(v_member.tier, 'Bronze'), v_points, v_voucher_code, (current_date + interval '30 days')::date, 'manual'
  )
  on conflict (member_id, reward_year) do nothing;

  insert into public.loyalty_transactions (member_id, transaction_type, points, reason, receipt_id)
  values (
    v_member.id,
    'MANUAL_AWARD',
    v_points,
    format('Birthday reward (%s)', v_year),
    format('BIRTHDAY-%s-%s', v_year, v_member.id)
  )
  on conflict (receipt_id) do nothing;

  return query select true, v_points, v_voucher_code;
end;
$$;

-- ============================================================
-- NOTIFICATION TRIGGERS
-- ============================================================

create or replace function public.loyalty_enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pref record;
  recent_promotional_count integer := 0;
begin
  if new.user_id is null then
    return new;
  end if;

  select
    m.sms_enabled,
    m.email_enabled,
    m.push_enabled,
    m.promotional_opt_in,
    m.communication_frequency
  into pref
  from auth.users u
  join public.loyalty_members m on lower(m.email) = lower(u.email)
  where u.id = new.user_id
  limit 1;

  if pref is null then
    return new;
  end if;

  if coalesce(new.is_promotional, false) = false then
    return new;
  end if;

  if new.channel = 'sms' and coalesce(pref.sms_enabled, true) = false then return null; end if;
  if new.channel = 'email' and coalesce(pref.email_enabled, true) = false then return null; end if;
  if new.channel = 'push' and coalesce(pref.push_enabled, true) = false then return null; end if;
  if coalesce(pref.promotional_opt_in, true) = false then return null; end if;
  if coalesce(pref.communication_frequency, 'weekly') = 'never' then return null; end if;

  if coalesce(pref.communication_frequency, 'weekly') = 'daily' then
    select count(*)
    into recent_promotional_count
    from public.notification_outbox n
    where n.user_id = new.user_id
      and n.channel = new.channel
      and coalesce(n.is_promotional, false) = true
      and n.created_at >= date_trunc('day', now());
  elsif coalesce(pref.communication_frequency, 'weekly') = 'weekly' then
    select count(*)
    into recent_promotional_count
    from public.notification_outbox n
    where n.user_id = new.user_id
      and n.channel = new.channel
      and coalesce(n.is_promotional, false) = true
      and n.created_at >= (now() - interval '7 days');
  end if;

  if recent_promotional_count > 0 then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_notification_preferences on public.notification_outbox;
create trigger trg_enforce_notification_preferences
before insert on public.notification_outbox
for each row
execute function public.loyalty_enforce_notification_preferences();

create or replace function public.loyalty_queue_welcome_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower(new.email)
  limit 1;

  if target_user_id is not null then
    insert into public.notification_outbox (user_id, channel, subject, message)
    values
      (
        target_user_id,
        'sms',
        'Welcome',
        format('Welcome to GREENOVATE Rewards! Your Member ID is %s. You start with 0 points.', coalesce(new.member_number, 'Pending ID'))
      ),
      (
        target_user_id,
        'email',
        'Welcome to GREENOVATE Rewards',
        format(
          'Hi %s, welcome to GREENOVATE Rewards! Your Member ID is %s. Program basics: earn points on purchases, redeem rewards in-app, and monitor expiry alerts in your dashboard.',
          coalesce(new.first_name, 'Member'),
          coalesce(new.member_number, 'Pending ID')
        )
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_welcome_notification on public.loyalty_members;
create trigger trg_welcome_notification
after insert on public.loyalty_members
for each row
execute function public.loyalty_queue_welcome_notifications();

create or replace function public.loyalty_queue_profile_update_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if (
    old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name
    or old.email is distinct from new.email
    or old.phone is distinct from new.phone
    or old.birthdate is distinct from new.birthdate
    or old.address is distinct from new.address
    or old.profile_photo_url is distinct from new.profile_photo_url
  ) then
    select id into target_user_id
    from auth.users
    where lower(email) = lower(new.email)
    limit 1;

    insert into public.notification_outbox (user_id, channel, subject, message)
    values (
      coalesce(target_user_id, auth.uid()),
      'email',
      'Profile Updated',
      format('Hi %s, your loyalty profile was updated on %s.', coalesce(new.first_name, 'member'), now()::text)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profile_update_notification on public.loyalty_members;
create trigger trg_profile_update_notification
after update on public.loyalty_members
for each row
execute function public.loyalty_queue_profile_update_notification();

create or replace function public.loyalty_queue_transaction_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  target_email text;
  target_member_number text;
  action_word text;
begin
  select email, member_number
  into target_email, target_member_number
  from public.loyalty_members
  where id = new.member_id;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if new.points > 0 then
    action_word := 'earned';
  else
    action_word := 'spent';
  end if;

  if target_user_id is not null then
    insert into public.notification_outbox (user_id, channel, subject, message)
    values (
      target_user_id,
      'push',
      'Points Update',
      format('You just %s %s points. Reason: %s', action_word, abs(new.points), coalesce(new.reason, 'Transaction'))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_notification on public.loyalty_transactions;
create trigger trg_transaction_notification
after insert on public.loyalty_transactions
for each row
execute function public.loyalty_queue_transaction_notification();

-- ============================================================
-- BALANCE, AUDIT, FIFO, EXPIRY, AND TIER TRIGGERS
-- ============================================================

create or replace function public.loyalty_update_member_balance()
returns trigger
language plpgsql
as $$
declare
  new_balance int;
begin
  update public.loyalty_members
  set points_balance = points_balance + new.points
  where id = new.member_id
  returning points_balance into new_balance;

  update public.loyalty_members
  set tier = public.loyalty_resolve_tier(new_balance)
  where id = new.member_id;

  return new;
end;
$$;

drop trigger if exists trg_update_balance_on_tx on public.loyalty_transactions;
create trigger trg_update_balance_on_tx
after insert on public.loyalty_transactions
for each row
execute function public.loyalty_update_member_balance();

create or replace function public.loyalty_log_profile_update()
returns trigger
language plpgsql
as $$
begin
  insert into public.loyalty_member_profile_audit (member_id, changed_by, old_data, new_data)
  values (old.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists trg_profile_audit on public.loyalty_members;
create trigger trg_profile_audit
after update on public.loyalty_members
for each row
execute function public.loyalty_log_profile_update();

create or replace function public.loyalty_build_lot_on_earn()
returns trigger
language plpgsql
as $$
begin
  if new.points > 0 and upper(coalesce(new.transaction_type, '')) in ('PURCHASE', 'EARN', 'MANUAL_AWARD') then
    insert into public.points_lots (member_id, source_transaction_id, original_points, remaining_points, earned_at, expiry_date)
    values (
      new.member_id,
      new.id,
      new.points,
      new.points,
      coalesce(new.transaction_date, now()),
      coalesce(new.expiry_date, coalesce(new.transaction_date, now()) + interval '12 months')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_points_lot_on_earn on public.loyalty_transactions;
create trigger trg_points_lot_on_earn
after insert on public.loyalty_transactions
for each row
execute function public.loyalty_build_lot_on_earn();

create or replace function public.loyalty_consume_lot_on_spend()
returns trigger
language plpgsql
as $$
declare
  remaining int := abs(new.points);
  lot record;
  consume_now int;
begin
  if new.points >= 0 then
    return new;
  end if;

  for lot in
    select id, remaining_points
    from public.points_lots
    where member_id = new.member_id
      and remaining_points > 0
    order by expiry_date asc, earned_at asc, id asc
  loop
    exit when remaining <= 0;
    consume_now := least(lot.remaining_points, remaining);

    update public.points_lots
    set remaining_points = remaining_points - consume_now
    where id = lot.id;

    remaining := remaining - consume_now;
  end loop;

  if remaining > 0 then
    raise exception 'Insufficient points for redemption.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_points_lot_on_spend on public.loyalty_transactions;
create trigger trg_points_lot_on_spend
before insert on public.loyalty_transactions
for each row
execute function public.loyalty_consume_lot_on_spend();

create or replace function public.loyalty_consume_points_fifo(
  p_member_id bigint,
  p_points_to_consume int,
  p_reason text default 'Reward Redemption'
)
returns int
language plpgsql
as $$
begin
  return 0;
end;
$$;

create or replace function public.loyalty_queue_expiry_warning_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  with expiring_lots as (
    select
      l.member_id,
      m.email,
      sum(l.remaining_points)::integer as points_expiring,
      min(l.expiry_date)::date as nearest_expiry
    from public.points_lots l
    join public.loyalty_members m on m.id = l.member_id
    where l.remaining_points > 0
      and l.expiry_date::date = (current_date + interval '30 days')::date
    group by l.member_id, m.email
  ), inserted as (
    insert into public.notification_outbox (user_id, channel, subject, message)
    select
      u.id,
      'email',
      'Points Expiry Reminder',
      format('You have %s points expiring on %s. Redeem them before expiry.', e.points_expiring, e.nearest_expiry)
    from expiring_lots e
    left join auth.users u on lower(u.email) = lower(e.email)
    returning 1
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

-- ============================================================
-- EPIC-LYL-06: CAMPAIGNS & PROMOTIONS
-- SCRUM 169 - SCRUM 190
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.reward_partners (
  id bigserial primary key,
  partner_code text not null unique,
  partner_name text not null,
  description text,
  logo_url text,
  conversion_rate numeric(10, 4) not null default 1.0000,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_partners_name_not_blank check (char_length(trim(partner_name)) > 0),
  constraint reward_partners_conversion_rate_check check (conversion_rate > 0)
);

drop trigger if exists trg_reward_partners_updated_at on public.reward_partners;
create trigger trg_reward_partners_updated_at
before update on public.reward_partners
for each row
execute function public.touch_updated_at();

alter table public.rewards_catalog
  add column if not exists partner_id bigint references public.reward_partners(id) on delete set null,
  add column if not exists cash_value numeric(10, 2);

create index if not exists idx_rewards_catalog_partner
  on public.rewards_catalog(partner_id, is_active);

create table if not exists public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null unique,
  campaign_name text not null,
  description text,
  campaign_type text not null,
  status text not null default 'scheduled',
  multiplier numeric(10, 2) not null default 1.00,
  minimum_purchase_amount numeric(10, 2) not null default 0,
  bonus_points integer not null default 0,
  product_scope jsonb not null default '[]'::jsonb,
  eligible_tiers text[] not null default array[]::text[],
  reward_id bigint references public.rewards_catalog(id) on delete set null,
  flash_sale_quantity_limit integer,
  flash_sale_claimed_count integer not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  countdown_label text,
  banner_title text,
  banner_message text,
  banner_color text not null default '#1A2B47',
  push_notification_enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_campaigns_name_not_blank check (char_length(trim(campaign_name)) > 0),
  constraint promotion_campaigns_type_check check (
    campaign_type in ('bonus_points', 'flash_sale', 'multiplier_event')
  ),
  constraint promotion_campaigns_status_check check (
    status in ('draft', 'scheduled', 'active', 'completed', 'archived')
  ),
  constraint promotion_campaigns_multiplier_check check (multiplier >= 1),
  constraint promotion_campaigns_bonus_points_check check (bonus_points >= 0),
  constraint promotion_campaigns_min_purchase_check check (minimum_purchase_amount >= 0),
  constraint promotion_campaigns_flash_sale_limit_check check (
    flash_sale_quantity_limit is null or flash_sale_quantity_limit > 0
  ),
  constraint promotion_campaigns_sale_count_check check (flash_sale_claimed_count >= 0),
  constraint promotion_campaigns_dates_check check (ends_at > starts_at)
);

create index if not exists idx_promotion_campaigns_type_status_dates
  on public.promotion_campaigns(campaign_type, status, starts_at, ends_at);

create index if not exists idx_promotion_campaigns_reward
  on public.promotion_campaigns(reward_id, starts_at desc);

create or replace function public.sync_promotion_campaign_status()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'archived' then
    if new.ends_at <= now() then
      new.status = 'completed';
    elsif new.starts_at <= now() and new.ends_at > now() then
      new.status = 'active';
    elsif new.status <> 'draft' then
      new.status = 'scheduled';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_promotion_campaign_status on public.promotion_campaigns;
create trigger trg_sync_promotion_campaign_status
before insert or update on public.promotion_campaigns
for each row
execute function public.sync_promotion_campaign_status();

alter table public.loyalty_transactions
  add column if not exists reward_catalog_id bigint references public.rewards_catalog(id) on delete set null,
  add column if not exists promotion_campaign_id uuid references public.promotion_campaigns(id) on delete set null,
  add column if not exists product_code text,
  add column if not exists product_category text;

create index if not exists idx_loyalty_transactions_reward_catalog
  on public.loyalty_transactions(reward_catalog_id, transaction_date desc);

create index if not exists idx_loyalty_transactions_campaign
  on public.loyalty_transactions(promotion_campaign_id, transaction_date desc);

alter table public.notification_outbox
  add column if not exists member_id bigint references public.loyalty_members(id) on delete cascade,
  add column if not exists promotion_campaign_id uuid references public.promotion_campaigns(id) on delete set null;

create index if not exists idx_notification_outbox_member_created
  on public.notification_outbox(member_id, created_at desc);

create index if not exists idx_notification_outbox_campaign_created
  on public.notification_outbox(promotion_campaign_id, created_at desc);

create table if not exists public.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  badge_code text not null unique,
  badge_name text not null,
  description text,
  icon_name text not null default 'Award',
  milestone_type text not null,
  milestone_target integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_definitions_name_not_blank check (char_length(trim(badge_name)) > 0),
  constraint badge_definitions_milestone_type_check check (
    milestone_type in ('first_purchase', 'transaction_count', 'points_earned', 'membership_years')
  ),
  constraint badge_definitions_target_check check (milestone_target > 0)
);

drop trigger if exists trg_badge_definitions_updated_at on public.badge_definitions;
create trigger trg_badge_definitions_updated_at
before update on public.badge_definitions
for each row
execute function public.touch_updated_at();

create table if not exists public.member_badge_awards (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  badge_id uuid not null references public.badge_definitions(id) on delete cascade,
  earned_at timestamptz not null default now(),
  progress_value integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  unique (member_id, badge_id)
);

create index if not exists idx_member_badge_awards_member
  on public.member_badge_awards(member_id, earned_at desc);

create index if not exists idx_member_badge_awards_badge
  on public.member_badge_awards(badge_id, earned_at desc);

create or replace function public.apply_campaign_bonus(
  base_points int,
  purchase_amount decimal,
  campaign_min_purchase decimal,
  multiplier decimal
)
returns int
language plpgsql
as $$
begin
  if purchase_amount >= campaign_min_purchase then
    return floor(base_points * multiplier);
  end if;

  return base_points;
end;
$$;

create or replace function public.check_flash_sale_limit(
  current_redemptions int,
  max_limit int,
  end_date timestamptz
)
returns text
language plpgsql
as $$
begin
  if current_redemptions >= max_limit then
    raise exception 'Flash sale quantity limit reached (Sold Out).';
  elsif now() > end_date then
    raise exception 'Flash sale time limit expired.';
  end if;

  return 'Redemption Approved';
end;
$$;

create or replace function public.loyalty_resolve_purchase_campaigns(
  p_member_id bigint,
  p_purchase_amount numeric,
  p_base_points integer,
  p_member_tier text default null,
  p_product_scope text default null
)
returns table (
  campaign_id uuid,
  campaign_name text,
  campaign_type text,
  awarded_points integer,
  applied_multiplier numeric,
  minimum_purchase_amount numeric
)
language sql
as $$
  select
    c.id,
    c.campaign_name,
    c.campaign_type,
    greatest(
      case
        when c.campaign_type = 'bonus_points' and c.bonus_points > 0 then c.bonus_points
        when c.multiplier > 1
          then public.apply_campaign_bonus(p_base_points, p_purchase_amount, c.minimum_purchase_amount, c.multiplier) - p_base_points
        else 0
      end,
      0
    )::integer as awarded_points,
    c.multiplier as applied_multiplier,
    c.minimum_purchase_amount
  from public.promotion_campaigns c
  where c.campaign_type in ('bonus_points', 'multiplier_event')
    and c.status in ('scheduled', 'active')
    and now() between c.starts_at and c.ends_at
    and p_purchase_amount >= c.minimum_purchase_amount
    and (
      coalesce(array_length(c.eligible_tiers, 1), 0) = 0
      or coalesce(p_member_tier, 'Bronze') = any(c.eligible_tiers)
    )
    and (
      jsonb_array_length(c.product_scope) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(c.product_scope) as scope(value)
        where lower(trim(scope.value)) = lower(trim(coalesce(p_product_scope, '')))
      )
    );
$$;

create or replace function public.loyalty_claim_flash_sale_campaign(p_campaign_id uuid)
returns table (
  campaign_id uuid,
  claimed_count integer,
  quantity_limit integer,
  ends_at timestamptz
)
language plpgsql
as $$
declare
  v_campaign public.promotion_campaigns%rowtype;
begin
  update public.promotion_campaigns as pc
  set
    flash_sale_claimed_count = flash_sale_claimed_count + 1,
    status = case
      when flash_sale_quantity_limit is not null and flash_sale_claimed_count + 1 >= flash_sale_quantity_limit then 'completed'
      else status
    end,
    updated_at = now()
  where pc.id = p_campaign_id
    and pc.campaign_type = 'flash_sale'
    and now() >= pc.starts_at
    and now() <= pc.ends_at
    and (pc.flash_sale_quantity_limit is null or pc.flash_sale_claimed_count < pc.flash_sale_quantity_limit)
  returning * into v_campaign;

  if not found then
    select *
    into v_campaign
    from public.promotion_campaigns pc
    where pc.id = p_campaign_id;

    if v_campaign.id is null then
      raise exception 'Flash sale campaign not found.';
    end if;

    perform public.check_flash_sale_limit(
      coalesce(v_campaign.flash_sale_claimed_count, 0),
      coalesce(nullif(v_campaign.flash_sale_quantity_limit, 0), 2147483647),
      v_campaign.ends_at
    );
  end if;

  return query
  select v_campaign.id, v_campaign.flash_sale_claimed_count, v_campaign.flash_sale_quantity_limit, v_campaign.ends_at;
end;
$$;

create or replace function public.loyalty_queue_campaign_notifications(p_campaign_id uuid)
returns integer
language plpgsql
as $$
declare
  queued_count integer := 0;
begin
  insert into public.notification_outbox (
    member_id,
    channel,
    subject,
    message,
    is_promotional,
    promotion_campaign_id
  )
  select
    m.id,
    'push',
    coalesce(c.banner_title, c.campaign_name),
    coalesce(c.banner_message, c.description, 'A new member promotion is now live.'),
    true,
    c.id
  from public.promotion_campaigns c
  join public.loyalty_members m
    on coalesce(m.push_enabled, true) = true
   and coalesce(m.promotional_opt_in, true) = true
   and coalesce(m.communication_frequency, 'weekly') <> 'never'
  where c.id = p_campaign_id
    and c.push_notification_enabled = true
    and (
      coalesce(array_length(c.eligible_tiers, 1), 0) = 0
      or coalesce(m.tier, 'Bronze') = any(c.eligible_tiers)
    );

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create or replace function public.loyalty_refresh_member_badges(p_member_id bigint)
returns integer
language plpgsql
as $$
declare
  granted_count integer := 0;
begin
  with metrics as (
    select
      p_member_id as member_id,
      count(*) filter (where upper(coalesce(transaction_type, '')) = 'PURCHASE')::integer as purchase_count,
      count(*)::integer as transaction_count,
      coalesce(sum(case when points > 0 then points else 0 end), 0)::integer as points_earned
    from public.loyalty_transactions
    where member_id = p_member_id
  ),
  membership as (
    select
      m.id as member_id,
      greatest(
        0,
        floor(extract(epoch from (now() - coalesce(m.enrollment_date::timestamptz, now()))) / 31557600)
      )::integer as membership_years
    from public.loyalty_members m
    where m.id = p_member_id
  ),
  current_values as (
    select 'first_purchase'::text as milestone_type, coalesce(metrics.purchase_count, 0) as current_value
    from metrics
    union all
    select 'transaction_count'::text, coalesce(metrics.transaction_count, 0)
    from metrics
    union all
    select 'points_earned'::text, coalesce(metrics.points_earned, 0)
    from metrics
    union all
    select 'membership_years'::text, coalesce(membership.membership_years, 0)
    from membership
  ),
  awarded as (
    insert into public.member_badge_awards (member_id, badge_id, progress_value, metadata)
    select
      p_member_id,
      bd.id,
      cv.current_value,
      jsonb_build_object('granted_by', 'loyalty_refresh_member_badges')
    from public.badge_definitions bd
    join current_values cv
      on cv.milestone_type = bd.milestone_type
    where bd.is_active = true
      and cv.current_value >= bd.milestone_target
      and not exists (
        select 1
        from public.member_badge_awards mba
        where mba.member_id = p_member_id
          and mba.badge_id = bd.id
      )
    returning badge_id
  ),
  notified as (
    insert into public.notification_outbox (
      member_id,
      channel,
      subject,
      message,
      is_promotional
    )
    select
      p_member_id,
      'push',
      'Badge unlocked',
      'You earned the ' || bd.badge_name || ' badge.',
      false
    from awarded a
    join public.badge_definitions bd
      on bd.id = a.badge_id
    returning 1
  )
  select count(*)::integer
  into granted_count
  from notified;

  return coalesce(granted_count, 0);
end;
$$;

create or replace function public.trg_loyalty_refresh_badges()
returns trigger
language plpgsql
as $$
begin
  if new.member_id is not null then
    perform public.loyalty_refresh_member_badges(new.member_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_transactions_refresh_badges on public.loyalty_transactions;
create trigger trg_loyalty_transactions_refresh_badges
after insert on public.loyalty_transactions
for each row
execute function public.trg_loyalty_refresh_badges();

create or replace function public.trg_loyalty_members_refresh_badges()
returns trigger
language plpgsql
as $$
begin
  perform public.loyalty_refresh_member_badges(new.id);
  return new;
end;
$$;

drop trigger if exists trg_loyalty_members_refresh_badges on public.loyalty_members;
create trigger trg_loyalty_members_refresh_badges
after insert or update of enrollment_date on public.loyalty_members
for each row
execute function public.trg_loyalty_members_refresh_badges();

create or replace function public.loyalty_member_badge_progress(p_member_id bigint)
returns table (
  badge_id uuid,
  badge_code text,
  badge_name text,
  description text,
  icon_name text,
  milestone_type text,
  milestone_target integer,
  progress_value integer,
  is_earned boolean,
  earned_at timestamptz
)
language sql
as $$
  with metrics as (
    select
      count(*) filter (where upper(coalesce(transaction_type, '')) = 'PURCHASE')::integer as purchase_count,
      count(*)::integer as transaction_count,
      coalesce(sum(case when points > 0 then points else 0 end), 0)::integer as points_earned
    from public.loyalty_transactions
    where member_id = p_member_id
  ),
  membership as (
    select
      greatest(
        0,
        floor(extract(epoch from (now() - coalesce(m.enrollment_date::timestamptz, now()))) / 31557600)
      )::integer as membership_years
    from public.loyalty_members m
    where m.id = p_member_id
  ),
  current_values as (
    select 'first_purchase'::text as milestone_type, coalesce(metrics.purchase_count, 0) as current_value
    from metrics
    union all
    select 'transaction_count'::text, coalesce(metrics.transaction_count, 0)
    from metrics
    union all
    select 'points_earned'::text, coalesce(metrics.points_earned, 0)
    from metrics
    union all
    select 'membership_years'::text, coalesce(membership.membership_years, 0)
    from membership
  )
  select
    bd.id,
    bd.badge_code,
    bd.badge_name,
    bd.description,
    bd.icon_name,
    bd.milestone_type,
    bd.milestone_target,
    coalesce(cv.current_value, 0) as progress_value,
    mba.id is not null as is_earned,
    mba.earned_at
  from public.badge_definitions bd
  left join current_values cv
    on cv.milestone_type = bd.milestone_type
  left join public.member_badge_awards mba
    on mba.badge_id = bd.id
   and mba.member_id = p_member_id
  where bd.is_active = true
  order by bd.milestone_target, bd.badge_name;
$$;

create or replace function public.loyalty_badge_leaderboard(p_limit integer default 10)
returns table (
  member_id bigint,
  member_number text,
  member_name text,
  badge_count bigint
)
language sql
as $$
  select
    m.id as member_id,
    m.member_number::text,
    trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as member_name,
    count(mba.id)::bigint as badge_count
  from public.loyalty_members m
  left join public.member_badge_awards mba
    on mba.member_id = m.id
  group by m.id, m.member_number, m.first_name, m.last_name
  order by badge_count desc, member_name asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.loyalty_campaign_performance()
returns table (
  campaign_id uuid,
  campaign_code text,
  campaign_name text,
  campaign_type text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  notifications_sent bigint,
  tracked_transactions bigint,
  points_awarded bigint,
  redemption_count bigint,
  quantity_limit integer,
  quantity_claimed integer,
  sell_through numeric,
  redemption_speed_per_hour numeric
)
language sql
as $$
  with tx as (
    select
      promotion_campaign_id,
      count(*)::bigint as tracked_transactions,
      coalesce(sum(case when points > 0 then points else 0 end), 0)::bigint as points_awarded,
      count(*) filter (where upper(coalesce(transaction_type, '')) in ('REDEEM', 'GIFT'))::bigint as redemption_count,
      min(transaction_date) filter (where upper(coalesce(transaction_type, '')) in ('REDEEM', 'GIFT')) as first_redemption_at,
      max(transaction_date) filter (where upper(coalesce(transaction_type, '')) in ('REDEEM', 'GIFT')) as last_redemption_at
    from public.loyalty_transactions
    where promotion_campaign_id is not null
    group by promotion_campaign_id
  ),
  notif as (
    select
      promotion_campaign_id,
      count(*)::bigint as notifications_sent
    from public.notification_outbox
    where promotion_campaign_id is not null
    group by promotion_campaign_id
  )
  select
    c.id,
    c.campaign_code,
    c.campaign_name,
    c.campaign_type,
    c.status,
    c.starts_at,
    c.ends_at,
    coalesce(notif.notifications_sent, 0) as notifications_sent,
    coalesce(tx.tracked_transactions, 0) as tracked_transactions,
    coalesce(tx.points_awarded, 0) as points_awarded,
    coalesce(tx.redemption_count, 0) as redemption_count,
    c.flash_sale_quantity_limit as quantity_limit,
    c.flash_sale_claimed_count as quantity_claimed,
    case
      when c.flash_sale_quantity_limit is null or c.flash_sale_quantity_limit = 0 then null
      else round((c.flash_sale_claimed_count::numeric / c.flash_sale_quantity_limit::numeric) * 100, 2)
    end as sell_through,
    case
      when coalesce(tx.redemption_count, 0) = 0 then 0
      when tx.first_redemption_at is null or tx.last_redemption_at is null or tx.last_redemption_at = tx.first_redemption_at
        then tx.redemption_count::numeric
      else round(
        tx.redemption_count::numeric /
        greatest(extract(epoch from (tx.last_redemption_at - tx.first_redemption_at)) / 3600, 1),
        2
      )
    end as redemption_speed_per_hour
  from public.promotion_campaigns c
  left join tx
    on tx.promotion_campaign_id = c.id
  left join notif
    on notif.promotion_campaign_id = c.id
  order by c.starts_at desc, c.campaign_name asc;
$$;

create or replace function public.loyalty_partner_reward_performance()
returns table (
  partner_id bigint,
  partner_code text,
  partner_name text,
  rewards_count bigint,
  redemption_count bigint,
  unique_redeemers bigint,
  points_redeemed bigint
)
language sql
as $$
  select
    p.id,
    p.partner_code,
    p.partner_name,
    count(distinct r.id)::bigint as rewards_count,
    count(t.id)::bigint as redemption_count,
    count(distinct t.member_id)::bigint as unique_redeemers,
    coalesce(sum(abs(t.points)), 0)::bigint as points_redeemed
  from public.reward_partners p
  left join public.rewards_catalog r
    on r.partner_id = p.id
  left join public.loyalty_transactions t
    on t.reward_catalog_id = r.id
   and upper(coalesce(t.transaction_type, '')) in ('REDEEM', 'GIFT')
  group by p.id, p.partner_code, p.partner_name
  order by redemption_count desc, partner_name asc;
$$;

insert into public.reward_partners (
  partner_code,
  partner_name,
  description,
  logo_url,
  conversion_rate,
  is_active
)
values
  ('GRAB', 'Grab', 'Ride, food, and wallet vouchers for members.', 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600', 15.0000, true),
  ('SHOPEE', 'Shopee', 'Shopping voucher rewards with marketplace conversion.', 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600', 14.0000, true),
  ('FOODPANDA', 'Foodpanda', 'Delivery vouchers to expand redemption choice.', 'https://images.unsplash.com/photo-1516387938699-a93567ec168e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600', 12.5000, true)
on conflict (partner_code) do update
set
  partner_name = excluded.partner_name,
  description = excluded.description,
  logo_url = excluded.logo_url,
  conversion_rate = excluded.conversion_rate,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.rewards_catalog (
  reward_id,
  name,
  description,
  points_cost,
  category,
  image_url,
  is_active,
  expiry_date,
  partner_id,
  cash_value
)
select
  seed.reward_id,
  seed.name,
  seed.description,
  seed.points_cost,
  seed.category,
  seed.image_url,
  true,
  null,
  p.id,
  seed.cash_value
from (
  values
    ('RW009', 'Grab Voucher PHP 200', 'Partner voucher redeemable in Grab.', 3000, 'voucher', 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', 'GRAB', 200.00::numeric),
    ('RW010', 'Shopee Voucher PHP 150', 'Partner shopping voucher for Shopee.', 2100, 'voucher', 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', 'SHOPEE', 150.00::numeric),
    ('RW011', 'Foodpanda Voucher PHP 100', 'Delivery voucher for Foodpanda orders.', 1250, 'voucher', 'https://images.unsplash.com/photo-1516387938699-a93567ec168e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', 'FOODPANDA', 100.00::numeric)
) as seed(reward_id, name, description, points_cost, category, image_url, partner_code, cash_value)
join public.reward_partners p
  on p.partner_code = seed.partner_code
on conflict (reward_id) do update
set
  name = excluded.name,
  description = excluded.description,
  points_cost = excluded.points_cost,
  category = excluded.category,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  partner_id = excluded.partner_id,
  cash_value = excluded.cash_value;

insert into public.badge_definitions (
  badge_code,
  badge_name,
  description,
  icon_name,
  milestone_type,
  milestone_target,
  is_active
)
values
  ('FIRST_PURCHASE', 'First Purchase', 'Awarded after completing the first purchase transaction.', 'Receipt', 'first_purchase', 1, true),
  ('TEN_TRANSACTIONS', '10 Transactions', 'Awarded after 10 tracked loyalty transactions.', 'Repeat', 'transaction_count', 10, true),
  ('POINTS_1000', '1000 Points Earned', 'Awarded after earning 1000 cumulative points.', 'Sparkles', 'points_earned', 1000, true),
  ('LOYAL_ONE_YEAR', 'Loyal Member', 'Awarded after staying enrolled for at least one year.', 'ShieldCheck', 'membership_years', 1, true)
on conflict (badge_code) do update
set
  badge_name = excluded.badge_name,
  description = excluded.description,
  icon_name = excluded.icon_name,
  milestone_type = excluded.milestone_type,
  milestone_target = excluded.milestone_target,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.promotion_campaigns (
  campaign_code,
  campaign_name,
  description,
  campaign_type,
  status,
  multiplier,
  minimum_purchase_amount,
  bonus_points,
  product_scope,
  eligible_tiers,
  reward_id,
  flash_sale_quantity_limit,
  flash_sale_claimed_count,
  starts_at,
  ends_at,
  countdown_label,
  banner_title,
  banner_message,
  banner_color,
  push_notification_enabled
)
select
  seed.campaign_code,
  seed.campaign_name,
  seed.description,
  seed.campaign_type,
  seed.status,
  seed.multiplier,
  seed.minimum_purchase_amount,
  seed.bonus_points,
  seed.product_scope,
  seed.eligible_tiers,
  reward_lookup.id,
  seed.flash_sale_quantity_limit,
  seed.flash_sale_claimed_count,
  seed.starts_at,
  seed.ends_at,
  seed.countdown_label,
  seed.banner_title,
  seed.banner_message,
  seed.banner_color,
  seed.push_notification_enabled
from (
  values
    (
      'CMP-WEEKEND-2X',
      'Double Points Weekend',
      'Members earn 2x points on qualifying purchases all weekend.',
      'multiplier_event',
      'active',
      2.00::numeric,
      50.00::numeric,
      0,
      '[]'::jsonb,
      array['Bronze', 'Silver', 'Gold']::text[],
      null::text,
      null::integer,
      0,
      now() - interval '1 day',
      now() + interval '5 days',
      'Ends this weekend',
      '2x points live now',
      'Qualifying purchases above PHP 50 are earning double points.',
      '#0f766e',
      true
    ),
    (
      'CMP-PASTRY-BOOST',
      'Pastry Booster',
      'Buy any pastry and get 40 bonus points once the minimum purchase is met.',
      'bonus_points',
      'active',
      1.00::numeric,
      25.00::numeric,
      40,
      '["pastry"]'::jsonb,
      array['Bronze', 'Silver', 'Gold']::text[],
      null::text,
      null::integer,
      0,
      now() - interval '12 hours',
      now() + interval '7 days',
      null::text,
      'Pastry perk',
      'Buy pastry today and unlock 40 bonus points automatically.',
      '#c2410c',
      false
    ),
    (
      'CMP-GOLD-3X',
      'Gold 3x Hour',
      'Gold members earn triple points during the featured event window.',
      'multiplier_event',
      'active',
      3.00::numeric,
      75.00::numeric,
      0,
      '[]'::jsonb,
      array['Gold']::text[],
      null::text,
      null::integer,
      0,
      now() - interval '6 hours',
      now() + interval '3 days',
      null::text,
      'Gold member boost',
      'Gold members are getting 3x points on eligible purchases.',
      '#7c3aed',
      false
    ),
    (
      'CMP-GRAB-FLASH',
      'Grab Voucher Flash Sale',
      'Limited-time redemption window for the first 100 members.',
      'flash_sale',
      'active',
      1.00::numeric,
      0.00::numeric,
      0,
      '[]'::jsonb,
      array['Bronze', 'Silver', 'Gold']::text[],
      'RW009',
      100,
      0,
      now() - interval '2 hours',
      now() + interval '22 hours',
      '24-hour drop',
      'Flash sale is live',
      'Grab PHP 200 vouchers are available now for the first 100 members.',
      '#1d4ed8',
      true
    )
) as seed(
  campaign_code,
  campaign_name,
  description,
  campaign_type,
  status,
  multiplier,
  minimum_purchase_amount,
  bonus_points,
  product_scope,
  eligible_tiers,
  reward_code,
  flash_sale_quantity_limit,
  flash_sale_claimed_count,
  starts_at,
  ends_at,
  countdown_label,
  banner_title,
  banner_message,
  banner_color,
  push_notification_enabled
)
left join public.rewards_catalog reward_lookup
  on reward_lookup.reward_id = seed.reward_code
on conflict (campaign_code) do update
set
  campaign_name = excluded.campaign_name,
  description = excluded.description,
  campaign_type = excluded.campaign_type,
  status = excluded.status,
  multiplier = excluded.multiplier,
  minimum_purchase_amount = excluded.minimum_purchase_amount,
  bonus_points = excluded.bonus_points,
  product_scope = excluded.product_scope,
  eligible_tiers = excluded.eligible_tiers,
  reward_id = excluded.reward_id,
  flash_sale_quantity_limit = excluded.flash_sale_quantity_limit,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  countdown_label = excluded.countdown_label,
  banner_title = excluded.banner_title,
  banner_message = excluded.banner_message,
  banner_color = excluded.banner_color,
  push_notification_enabled = excluded.push_notification_enabled,
  updated_at = now();

select public.loyalty_refresh_member_badges(m.id)
from public.loyalty_members m;

create extension if not exists pg_cron;

do $cron$
declare
  existing_job_id integer;
  birthday_job_id integer;
begin
  begin
    select jobid
    into existing_job_id
    from cron.job
    where jobname = 'loyalty_expiry_warning_30d_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'loyalty_expiry_warning_30d_daily',
      '0 8 * * *',
      $job$select public.loyalty_queue_expiry_warning_notifications();$job$
    );
  exception
    when undefined_table then
      null;
  end;

  begin
    select jobid
    into birthday_job_id
    from cron.job
    where jobname = 'loyalty_birthday_rewards_daily'
    limit 1;

    if birthday_job_id is not null then
      perform cron.unschedule(birthday_job_id);
    end if;

    perform cron.schedule(
      'loyalty_birthday_rewards_daily',
      '5 8 * * *',
      $job$select public.loyalty_process_birthday_rewards(current_date);$job$
    );
  exception
    when undefined_table then
      null;
  end;
end;
$cron$;

create or replace function public.log_tier_change()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.tier, 'Bronze') is distinct from coalesce(new.tier, 'Bronze') then
    insert into public.tier_history (member_id, old_tier, new_tier, changed_at, reason)
    values (
      new.id,
      coalesce(old.tier, 'Bronze'),
      coalesce(new.tier, 'Bronze'),
      now(),
      'Auto tier recalculation'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_tier_change on public.loyalty_members;
create trigger trg_log_tier_change
after update on public.loyalty_members
for each row
execute function public.log_tier_change();

commit;
