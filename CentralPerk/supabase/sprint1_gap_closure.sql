-- Sprint 1 Gap Closure SQL
-- Project target: your final Supabase project
-- Purpose: close remaining infra gaps that cannot be applied directly from this local repo.
--
-- Covers:
-- - LYL-010: server-side background expiry processing
-- - LYL-011: stronger role + RLS enforcement for admin/customer data access
--
-- Run in Supabase SQL Editor as a privileged role.

begin;

-- -------------------------------------------------------------------
-- 1) Role source of truth table (for app-side role checks + RLS)
-- -------------------------------------------------------------------
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
  select role
  from public.app_user_roles
  where user_id = auth.uid()
$$;

create or replace function public.app_current_email()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '')
$$;

-- Backfill customer roles from loyalty_members (safe to run multiple times)
insert into public.app_user_roles (user_id, role)
select u.id, 'customer'
from auth.users u
join public.loyalty_members m on lower(m.email) = lower(u.email)
on conflict (user_id) do nothing;

-- OPTIONAL: mark known admin accounts.
-- Replace emails below with your real admin account emails, then run this block.
-- insert into public.app_user_roles (user_id, role)
-- select id, 'admin'
-- from auth.users
-- where lower(email) in ('admin1@admin.loyaltyhub.com', 'admin2@admin.loyaltyhub.com')
-- on conflict (user_id) do update set role = excluded.role, updated_at = now();

-- -------------------------------------------------------------------
-- 2) Tier resolver function for SQL-side updates
-- -------------------------------------------------------------------
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

-- -------------------------------------------------------------------
-- 3) Expiry processor (LYL-010): true server-side routine
-- -------------------------------------------------------------------
create or replace function public.loyalty_process_expired_points()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with expired_earned as (
    select
      lt.member_id,
      sum(abs(lt.points))::int as total_expired_earned
    from public.loyalty_transactions lt
    where lt.points > 0
      and lt.expiry_date is not null
      and lt.expiry_date < now()
    group by lt.member_id
  ),
  already_deducted as (
    select
      lt.member_id,
      sum(abs(lt.points))::int as total_deducted
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
    select
      td.member_id,
      'EXPIRY_DEDUCTION',
      -abs(td.points_to_deduct),
      'Points Expired',
      now()
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

-- Restrict function execution to service contexts by default
revoke all on function public.loyalty_process_expired_points() from public;

-- -------------------------------------------------------------------
-- 4) Scheduler setup (run nightly at 2:00 AM UTC)
-- -------------------------------------------------------------------
-- Prefer pg_cron if available. If your project doesn't support this,
-- use Supabase Dashboard -> Edge Functions -> Schedules instead.
create extension if not exists pg_cron;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'loyalty-expiry-nightly'
  ) then
    perform cron.schedule(
      'loyalty-expiry-nightly',
      '0 2 * * *',
      $$select public.loyalty_process_expired_points();$$
    );
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- 5) RLS policies (LYL-011)
-- -------------------------------------------------------------------
alter table public.app_user_roles enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.points_rules enable row level security;

-- Optional tables from this repo's mock-replacement migration
-- (will be no-op if absent)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rewards_catalog') then
    execute 'alter table public.rewards_catalog enable row level security';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'earn_tasks') then
    execute 'alter table public.earn_tasks enable row level security';
  end if;
end;
$$;

-- Drop old policies to make this script idempotent
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

-- app_user_roles
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

-- loyalty_members
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

-- loyalty_transactions
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

-- points_rules
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

-- Optional policies for rewards_catalog
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rewards_catalog') then
    execute 'drop policy if exists rewards_catalog_select_authenticated on public.rewards_catalog';
    execute 'drop policy if exists rewards_catalog_admin_write on public.rewards_catalog';
    execute 'create policy rewards_catalog_select_authenticated on public.rewards_catalog for select to authenticated using (true)';
    execute 'create policy rewards_catalog_admin_write on public.rewards_catalog for all to authenticated using (public.app_current_role() = ''admin'') with check (public.app_current_role() = ''admin'')';
  end if;
end;
$$;

-- Optional policies for earn_tasks
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'earn_tasks') then
    execute 'drop policy if exists earn_tasks_select_authenticated on public.earn_tasks';
    execute 'drop policy if exists earn_tasks_admin_write on public.earn_tasks';
    execute 'create policy earn_tasks_select_authenticated on public.earn_tasks for select to authenticated using (true)';
    execute 'create policy earn_tasks_admin_write on public.earn_tasks for all to authenticated using (public.app_current_role() = ''admin'') with check (public.app_current_role() = ''admin'')';
  end if;
end;
$$;

commit;

-- -------------------------------------------------------------------
-- Verification snippets (run manually after migration):
-- -------------------------------------------------------------------
-- select public.loyalty_process_expired_points();
-- select * from cron.job where jobname = 'loyalty-expiry-nightly';
-- select * from public.app_user_roles limit 20;

