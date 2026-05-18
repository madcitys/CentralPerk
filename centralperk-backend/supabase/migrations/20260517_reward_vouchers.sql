create table if not exists public.reward_vouchers (
  id text primary key,
  member_id text not null,
  member_email text,
  reward_id text not null,
  reward_catalog_id text,
  reward_name text not null,
  points_cost integer not null default 0,
  method text not null check (method in ('in-store', 'online')),
  voucher_code text not null unique,
  order_id text not null unique,
  qr_value text not null,
  qr_target_url text not null,
  partner_label text,
  delivery_partner text,
  delivery_address text,
  delivery_notes text,
  contact_number text,
  status text not null default 'ready' check (status in ('ready', 'processing', 'validated')),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint reward_vouchers_points_cost_check check (points_cost >= 0)
);

create index if not exists idx_reward_vouchers_member_id on public.reward_vouchers(member_id);
create index if not exists idx_reward_vouchers_member_email on public.reward_vouchers(lower(member_email));
create index if not exists idx_reward_vouchers_status on public.reward_vouchers(status);
