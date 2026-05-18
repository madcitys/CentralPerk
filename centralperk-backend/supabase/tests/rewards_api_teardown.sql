begin;

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
)
   or receipt_id like 'seed-%';

delete from public.promotion_campaigns
where campaign_code in ('CMP-TEST-2X', 'CMP-TEST-FLASH');

delete from public.rewards_catalog
where reward_id = 'RWTEST401';

delete from public.loyalty_members
where member_number = 'MEM-TEST-API-001'
   or email = 'contract.member@example.com';

commit;
