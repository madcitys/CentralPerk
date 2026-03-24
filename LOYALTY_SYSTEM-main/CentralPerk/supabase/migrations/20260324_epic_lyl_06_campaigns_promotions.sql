begin;

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
  update public.promotion_campaigns
  set
    flash_sale_claimed_count = flash_sale_claimed_count + 1,
    status = case
      when flash_sale_quantity_limit is not null and flash_sale_claimed_count + 1 >= flash_sale_quantity_limit then 'completed'
      else status
    end,
    updated_at = now()
  where id = p_campaign_id
    and campaign_type = 'flash_sale'
    and now() >= starts_at
    and now() <= ends_at
    and (flash_sale_quantity_limit is null or flash_sale_claimed_count < flash_sale_quantity_limit)
  returning * into v_campaign;

  if not found then
    select *
    into v_campaign
    from public.promotion_campaigns
    where id = p_campaign_id;

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

commit;
