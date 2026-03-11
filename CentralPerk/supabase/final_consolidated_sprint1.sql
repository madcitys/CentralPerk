-- ============================================================
-- LOYALTY HUB FINAL DATABASE SCHEMA
-- Supabase PostgreSQL
-- Sprint 1 Complete
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

create table if not exists public.loyalty_members (
  id bigserial primary key,
  member_id bigint,
  member_number varchar(20) unique,
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique not null,
  phone varchar(20),
  points_balance int default 0,
  tier varchar(20) default 'Bronze',
  enrollment_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  transaction_id bigint,
  member_id bigint references public.loyalty_members(id) on delete cascade,
  transaction_type varchar(50),
  points int not null,
  amount_spent decimal(10,2) default 0,
  reason text,
  receipt_id text,
  transaction_date timestamptz default now(),
  expiry_date timestamptz default (now() + interval '1 year')
);

create table if not exists public.points_rules (
  id bigserial primary key,
  tier_label varchar(20) unique not null,
  min_points int not null,
  is_active boolean default true
);

create table if not exists public.rewards_catalog (
  id bigserial primary key,
  reward_id text unique not null,
  name text not null,
  description text,
  points_cost int not null,
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
  points int not null,
  icon_key text,
  default_completed boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('admin','customer')),
  updated_at timestamptz default now()
);

create table if not exists public.notification_outbox (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  channel text check (channel in ('email','sms','push')),
  subject text,
  message text,
  status text default 'pending',
  created_at timestamptz default now(),
  sent_at timestamptz
);

create table if not exists public.loyalty_member_profile_audit (
  id bigserial primary key,
  member_id bigint references public.loyalty_members(id),
  changed_by uuid references auth.users(id),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_members_email
on public.loyalty_members(lower(email));

create index if not exists idx_transactions_member
on public.loyalty_transactions(member_id);

create index if not exists idx_transactions_date
on public.loyalty_transactions(transaction_date desc);

create index if not exists idx_rewards_active
on public.rewards_catalog(is_active);

create index if not exists idx_tasks_active
on public.earn_tasks(is_active);

-- ============================================================
-- DEFAULT DATA
-- ============================================================

insert into public.points_rules (tier_label,min_points)
values
('Bronze',0),
('Silver',250),
('Gold',750)
on conflict (tier_label) do nothing;

-- ============================================================
-- MEMBER NUMBER GENERATION
-- ============================================================

create or replace function public.loyalty_generate_member_number()
returns text
language plpgsql
as $$
declare
 next_id bigint;
begin
 select coalesce(max(id),0)+1 into next_id
 from public.loyalty_members;

 return 'MEM-' || lpad(next_id::text,6,'0');
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

drop trigger if exists trg_member_number
on public.loyalty_members;

create trigger trg_member_number
before insert on public.loyalty_members
for each row
execute function public.set_member_number();

-- ============================================================
-- PROFILE AUDIT
-- ============================================================

create or replace function public.loyalty_log_profile_update()
returns trigger
language plpgsql
as $$
begin
 insert into public.loyalty_member_profile_audit
 (member_id,changed_by,old_data,new_data)
 values
 (old.id,auth.uid(),to_jsonb(old),to_jsonb(new));

 return new;
end;
$$;

drop trigger if exists trg_profile_audit
on public.loyalty_members;

create trigger trg_profile_audit
after update on public.loyalty_members
for each row
execute function public.loyalty_log_profile_update();

-- ============================================================
-- WELCOME NOTIFICATION
-- ============================================================

create or replace function public.loyalty_queue_welcome_notifications()
returns trigger
language plpgsql
as $$
begin

 insert into public.notification_outbox
 (user_id,channel,subject,message)
 values
 (
  auth.uid(),
  'email',
  'Welcome to LoyaltyHub',
  'Thank you for joining our loyalty program.'
 );

 return new;
end;
$$;

drop trigger if exists trg_welcome_notification
on public.loyalty_members;

create trigger trg_welcome_notification
after insert on public.loyalty_members
for each row
execute function public.loyalty_queue_welcome_notifications();

-- ============================================================
-- TIER RESOLUTION
-- ============================================================

create or replace function public.loyalty_resolve_tier(p_points int)
returns text
language plpgsql
as $$
declare v_tier text;
begin

 select tier_label
 into v_tier
 from public.points_rules
 where p_points >= min_points
 order by min_points desc
 limit 1;

 return coalesce(v_tier,'Bronze');

end;
$$;

-- ============================================================
-- POINT EXPIRY PROCESSOR
-- ============================================================

create or replace function public.loyalty_process_expired_points()
returns void
language plpgsql
security definer
as $$
begin

 insert into public.loyalty_transactions
 (member_id,transaction_type,points,reason)

 select
 member_id,
 'EXPIRY_DEDUCTION',
 -abs(sum(points)),
 'Points Expired'

 from public.loyalty_transactions
 where expiry_date < now()
 and points > 0
 group by member_id;

end;
$$;

-- ============================================================
-- ROLE HELPER FUNCTIONS
-- ============================================================

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
 select coalesce(auth.jwt() ->> 'email','')
$$;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.loyalty_members enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.rewards_catalog enable row level security;
alter table public.points_rules enable row level security;
alter table public.earn_tasks enable row level security;
alter table public.app_user_roles enable row level security;

-- ============================================================
-- ADMIN FULL ACCESS
-- ============================================================

create policy admin_all_members
on public.loyalty_members
for all
using (public.app_current_role() = 'admin');

create policy admin_all_transactions
on public.loyalty_transactions
for all
using (public.app_current_role() = 'admin');

create policy admin_all_rewards
on public.rewards_catalog
for all
using (public.app_current_role() = 'admin');

create policy admin_all_tasks
on public.earn_tasks
for all
using (public.app_current_role() = 'admin');

-- ============================================================
-- CUSTOMER ACCESS
-- ============================================================

create policy customer_view_own_member
on public.loyalty_members
for select
using (
 lower(email)=lower(public.app_current_email())
);

create policy customer_update_own_member
on public.loyalty_members
for update
using (
 lower(email)=lower(public.app_current_email())
);

create policy customer_view_transactions
on public.loyalty_transactions
for select
using (
 exists(
   select 1
   from public.loyalty_members m
   where m.id = loyalty_transactions.member_id
   and lower(m.email)=lower(public.app_current_email())
 )
);

create policy public_view_rewards
on public.rewards_catalog
for select
using (true);

create policy public_view_tasks
on public.earn_tasks
for select
using (true);

-- ============================================================
-- END OF SCHEMA
-- ============================================================