begin;

insert into public.loyalty_members (
  member_number,
  first_name,
  last_name,
  email,
  phone,
  birthdate,
  points_balance,
  tier,
  enrollment_date,
  manual_segment
)
values (
  'MEM-TEST-API-001',
  'Contract',
  'Member',
  'contract.member@example.com',
  '09171234567',
  '1997-03-24',
  920,
  'Gold',
  current_date - interval '400 days',
  'High Value'
)
on conflict (member_number) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  birthdate = excluded.birthdate,
  points_balance = excluded.points_balance,
  tier = excluded.tier,
  enrollment_date = excluded.enrollment_date,
  manual_segment = excluded.manual_segment;

insert into public.rewards_catalog (
  reward_id,
  name,
  description,
  points_cost,
  category,
  is_active,
  expiry_date
)
values (
  'RWTEST401',
  'API Test Reward',
  'Synthetic reward for contract and load testing.',
  120,
  'voucher',
  true,
  now() + interval '90 days'
)
on conflict (reward_id) do update
set
  name = excluded.name,
  description = excluded.description,
  points_cost = excluded.points_cost,
  category = excluded.category,
  is_active = excluded.is_active,
  expiry_date = excluded.expiry_date;

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
  banner_title,
  banner_message,
  push_notification_enabled
)
select
  'CMP-TEST-2X',
  'API Test Double Points',
  'Synthetic multiplier campaign for automated tests.',
  'multiplier_event',
  'active',
  2.0,
  50,
  0,
  '["beverage"]'::jsonb,
  array['Gold']::text[],
  null,
  null,
  0,
  now() - interval '1 day',
  now() + interval '7 days',
  'API Test Double Points',
  'Automated test campaign is active.',
  true
where not exists (
  select 1 from public.promotion_campaigns where campaign_code = 'CMP-TEST-2X'
);

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
  push_notification_enabled
)
select
  'CMP-TEST-FLASH',
  'API Test Flash Sale',
  'Synthetic flash-sale campaign for automated tests.',
  'flash_sale',
  'active',
  1.0,
  0,
  0,
  '[]'::jsonb,
  array['Bronze', 'Silver', 'Gold']::text[],
  r.id,
  100,
  0,
  now() - interval '1 hour',
  now() + interval '1 day',
  'Test flash sale',
  'API Test Flash Sale',
  'Automated test flash sale is active.',
  true
from public.rewards_catalog r
where r.reward_id = 'RWTEST401'
  and not exists (
    select 1 from public.promotion_campaigns where campaign_code = 'CMP-TEST-FLASH'
  );

delete from public.notification_outbox
where subject like 'Seed %'
   or member_id in (
     select id from public.loyalty_members where member_number = 'MEM-TEST-API-001'
   );

delete from public.points_lots
where member_id in (
  select id from public.loyalty_members where member_number = 'MEM-TEST-API-001'
);

delete from public.loyalty_transactions
where member_id in (
  select id from public.loyalty_members where member_number = 'MEM-TEST-API-001'
);

insert into public.loyalty_transactions (
  member_id,
  transaction_type,
  points,
  reason,
  receipt_id,
  transaction_date,
  expiry_date
)
select
  m.id,
  'PURCHASE',
  200,
  'Seed expired earn',
  'seed-expired-earn',
  now() - interval '500 days',
  now() - interval '30 days'
from public.loyalty_members m
where m.member_number = 'MEM-TEST-API-001'
on conflict (receipt_id) do nothing;

insert into public.loyalty_transactions (
  member_id,
  transaction_type,
  points,
  reason,
  receipt_id,
  transaction_date,
  expiry_date
)
select
  m.id,
  'PURCHASE',
  250,
  'Seed active earn',
  'seed-active-earn',
  now() - interval '7 days',
  now() + interval '180 days'
from public.loyalty_members m
where m.member_number = 'MEM-TEST-API-001'
on conflict (receipt_id) do nothing;

insert into public.loyalty_transactions (
  member_id,
  transaction_type,
  points,
  reason,
  receipt_id,
  transaction_date
)
select
  m.id,
  'EXPIRY_DEDUCTION',
  -70,
  'Seed prior expiry deduction',
  'seed-expiry-deduction',
  now() - interval '2 days'
from public.loyalty_members m
where m.member_number = 'MEM-TEST-API-001'
on conflict (receipt_id) do nothing;

commit;
