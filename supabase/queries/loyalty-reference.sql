-- CentralPerk loyalty reference queries
-- These are read-oriented starter queries for Supabase SQL Editor.
-- Review table names and columns against your actual schema before running in shared environments.

-- Members
select
  id,
  member_number,
  first_name,
  last_name,
  email,
  points_balance,
  tier,
  enrollment_date
from loyalty_members
order by enrollment_date desc
limit 50;

-- Points tiers
select
  tier_label,
  min_points,
  is_active
from points_tiers
order by min_points desc;

-- Rewards catalog
select
  id,
  reward_catalog_id,
  name,
  points_cost,
  category,
  active
from reward_catalog
order by name asc;

-- Campaigns
select
  id,
  campaign_code,
  campaign_name,
  status,
  starts_at,
  ends_at,
  budget_limit,
  budget_spent
from loyalty_campaigns
order by created_at desc
limit 50;

-- Notification outbox
select
  id,
  user_id,
  member_id,
  channel,
  subject,
  status,
  created_at
from notification_outbox
order by created_at desc
limit 50;

-- Segments
select
  id,
  name,
  description,
  is_system,
  created_at,
  updated_at
from member_segments
order by is_system desc, name asc;
