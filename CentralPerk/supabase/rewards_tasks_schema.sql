-- Sprint 1 support tables to remove mock data from customer rewards/earn pages
-- Run this in Supabase SQL editor for project: fuvhpohwxyezscryekwq

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

