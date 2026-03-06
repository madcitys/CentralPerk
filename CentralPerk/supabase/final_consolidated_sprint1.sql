-- ============================================================
-- FINAL CONSOLIDATED SPRINT 1 SQL (Carlos-aligned)
-- ============================================================
-- Goal:
-- - One clean script for core loyalty schema + rewards/tasks + gap closure
-- - Matches current frontend/backend code in this repository
--
-- Comment markers used below:
-- - [ADDED BY CODEX]  : New logic/table/policy I added for missing gaps
-- - [EDITED BY CODEX] : Existing idea adapted to be idempotent and repo-aligned
--
-- Recommended run user:
-- - Supabase SQL editor with admin privileges

-- ------------------------------------------------------------
-- [EDITED BY CODEX] Core schema (Carlos-aligned + idempotent)
-- ------------------------------------------------------------
create table if not exists public.loyalty_members (
  id bigserial primary key,
  member_id bigint,
  member_number varchar(20) unique not null,
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique not null,
  phone varchar(20),
  points_balance int default 0,
  tier varchar(20) default 'Bronze',
  enrollment_date date default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  transaction_id bigint,
  member_id bigint references public.loyalty_members(id) on delete cascade,
  transaction_type varchar(50),
  points int not null,
  amount_spent decimal(10, 2) default 0.00,
  reason text,
  receipt_id text,
  transaction_date timestamptz default current_timestamp,
  expiry_date timestamptz default (current_timestamp + interval '1 year')
);

create table if not exists public.points_rules (
  id bigserial primary key,
  tier_label varchar(20) unique not null,
  min_points int not null,
  is_active boolean default true
);

insert into public.points_rules (tier_label, min_points, is_active)
values
  ('Bronze', 0, true),
  ('Silver', 250, true),
  ('Gold', 750, true)
on conflict (tier_label) do update
set
  min_points = excluded.min_points,
  is_active = excluded.is_active;

create index if not exists idx_loyalty_members_email on public.loyalty_members(lower(email));
create index if not exists idx_loyalty_members_member_number on public.loyalty_members(member_number);
create index if not exists idx_loyalty_transactions_member_id on public.loyalty_transactions(member_id);
create index if not exists idx_loyalty_transactions_date on public.loyalty_transactions(transaction_date desc);
create index if not exists idx_loyalty_transactions_type on public.loyalty_transactions(transaction_type);

-- ------------------------------------------------------------
-- [ADDED BY CODEX] Replace remaining mock-data dependencies
-- ------------------------------------------------------------
create table if not exists public.rewards_catalog (
  id bigserial primary key,
  reward_id text unique not null,
  name text not null,
  description text not null default '',
  points_cost integer not null check (points_cost >= 0),
  category text not null check (category in ('food', 'beverage', 'merchandise', 'voucher')),
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

create index if not exists idx_rewards_catalog_active on public.rewards_catalog(is_active);
create index if not exists idx_earn_tasks_active on public.earn_tasks(is_active);

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

-- ------------------------------------------------------------
-- [ADDED BY CODEX] LYL-011 role source table + helpers
-- ------------------------------------------------------------
create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'customer')),
  updated_at timestamptz not null default now()
);

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

-- [ADDED BY CODEX] Backfill known customer roles from existing member emails
insert into public.app_user_roles (user_id, role)
select u.id, 'customer'
from auth.users u
join public.loyalty_members m on lower(m.email) = lower(u.email)
on conflict (user_id) do nothing;

-- [ADDED BY CODEX] Optional admin role assignment template (edit then run)
-- insert into public.app_user_roles (user_id, role)
-- select id, 'admin'
-- from auth.users
-- where lower(email) in ('admin1@admin.loyaltyhub.com')
-- on conflict (user_id) do update set role = excluded.role, updated_at = now();

-- ------------------------------------------------------------
-- [ADDED BY CODEX] LYL-010 tier resolver + expiry processor
-- ------------------------------------------------------------
create or replace function public.loyalty_resolve_tier(p_points int)
returns text
language plpgsql
stable
as $$
declare
  v_tier text;
begin
  select pr.tier_label
  into v_tier
  from public.points_rules pr
  where pr.is_active = true
    and p_points >= pr.min_points
  order by pr.min_points desc
  limit 1;

  return coalesce(v_tier, 'Bronze');
end;
$$;

create or replace function public.loyalty_process_expired_points()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with expired_earned as (
    select lt.member_id, sum(abs(lt.points))::int as total_expired_earned
    from public.loyalty_transactions lt
    where lt.points > 0
      and lt.expiry_date is not null
      and lt.expiry_date < now()
    group by lt.member_id
  ),
  already_deducted as (
    select lt.member_id, sum(abs(lt.points))::int as total_deducted
    from public.loyalty_transactions lt
    where upper(coalesce(lt.transaction_type, '')) = 'EXPIRY_DEDUCTION'
    group by lt.member_id
  ),
  to_deduct as (
    select
      e.member_id,
      greatest(0, e.total_expired_earned - coalesce(d.total_deducted, 0))::int as points_to_deduct
    from expired_earned e
    left join already_deducted d on d.member_id = e.member_id
    where greatest(0, e.total_expired_earned - coalesce(d.total_deducted, 0)) > 0
  ),
  inserted as (
    insert into public.loyalty_transactions (member_id, transaction_type, points, reason, transaction_date)
    select td.member_id, 'EXPIRY_DEDUCTION', -abs(td.points_to_deduct), 'Points Expired', now()
    from to_deduct td
    returning member_id, points
  )
  update public.loyalty_members m
  set
    points_balance = greatest(0, coalesce(m.points_balance, 0) - abs(i.points)),
    tier = public.loyalty_resolve_tier(greatest(0, coalesce(m.points_balance, 0) - abs(i.points)))
  from inserted i
  where m.id = i.member_id;
end;
$$;

revoke all on function public.loyalty_process_expired_points() from public;

-- ------------------------------------------------------------
-- [ADDED BY CODEX] Scheduler setup (best-effort)
-- ------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension not available in this project. Use Supabase dashboard scheduler fallback.';
  end;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'loyalty-expiry-nightly') then
      perform cron.schedule(
        'loyalty-expiry-nightly',
        '0 2 * * *',
        $$select public.loyalty_process_expired_points();$$
      );
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- [ADDED BY CODEX] RLS policies for admin/customer isolation
-- ------------------------------------------------------------
alter table public.app_user_roles enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.points_rules enable row level security;
alter table public.rewards_catalog enable row level security;
alter table public.earn_tasks enable row level security;

drop policy if exists app_user_roles_self_select on public.app_user_roles;
drop policy if exists app_user_roles_admin_all on public.app_user_roles;
drop policy if exists loyalty_members_admin_all on public.loyalty_members;
drop policy if exists loyalty_members_customer_select_own on public.loyalty_members;
drop policy if exists loyalty_members_customer_update_own on public.loyalty_members;
drop policy if exists loyalty_members_customer_insert_own on public.loyalty_members;
drop policy if exists loyalty_transactions_admin_all on public.loyalty_transactions;
drop policy if exists loyalty_transactions_customer_select_own on public.loyalty_transactions;
drop policy if exists loyalty_transactions_customer_insert_own on public.loyalty_transactions;
drop policy if exists points_rules_select_authenticated on public.points_rules;
drop policy if exists points_rules_admin_write on public.points_rules;
drop policy if exists rewards_catalog_select_authenticated on public.rewards_catalog;
drop policy if exists rewards_catalog_admin_write on public.rewards_catalog;
drop policy if exists earn_tasks_select_authenticated on public.earn_tasks;
drop policy if exists earn_tasks_admin_write on public.earn_tasks;

create policy app_user_roles_self_select
on public.app_user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy app_user_roles_admin_all
on public.app_user_roles
for all
to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

create policy loyalty_members_admin_all
on public.loyalty_members
for all
to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

create policy loyalty_members_customer_select_own
on public.loyalty_members
for select
to authenticated
using (lower(email) = lower(public.app_current_email()));

create policy loyalty_members_customer_update_own
on public.loyalty_members
for update
to authenticated
using (lower(email) = lower(public.app_current_email()))
with check (lower(email) = lower(public.app_current_email()));

create policy loyalty_members_customer_insert_own
on public.loyalty_members
for insert
to authenticated
with check (lower(email) = lower(public.app_current_email()));

create policy loyalty_transactions_admin_all
on public.loyalty_transactions
for all
to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

create policy loyalty_transactions_customer_select_own
on public.loyalty_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.loyalty_members m
    where m.id = loyalty_transactions.member_id
      and lower(m.email) = lower(public.app_current_email())
  )
);

create policy loyalty_transactions_customer_insert_own
on public.loyalty_transactions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.loyalty_members m
    where m.id = loyalty_transactions.member_id
      and lower(m.email) = lower(public.app_current_email())
  )
);

create policy points_rules_select_authenticated
on public.points_rules
for select
to authenticated
using (true);

create policy points_rules_admin_write
on public.points_rules
for all
to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

create policy rewards_catalog_select_authenticated
on public.rewards_catalog
for select
to authenticated
using (true);

create policy rewards_catalog_admin_write
on public.rewards_catalog
for all
to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

create policy earn_tasks_select_authenticated
on public.earn_tasks
for select
to authenticated
using (true);

create policy earn_tasks_admin_write
on public.earn_tasks
for all
to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

-- ------------------------------------------------------------
-- [ADDED BY CODEX] Quick verification queries (manual run)
-- ------------------------------------------------------------
-- select * from public.points_rules order by min_points;
-- select count(*) from public.rewards_catalog;
-- select count(*) from public.earn_tasks;
-- select * from public.app_user_roles limit 20;
-- select * from cron.job where jobname = 'loyalty-expiry-nightly';

