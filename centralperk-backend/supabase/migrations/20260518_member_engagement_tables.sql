-- Apply in the Member Service Supabase project.
create table if not exists public.challenges (
  id text primary key default gen_random_uuid()::text,
  challenge_code text not null unique,
  challenge_name text not null,
  challenge_type text not null default 'survey-completion'
    check (challenge_type in ('purchase-count', 'points-earned', 'survey-completion')),
  description text not null default '',
  target_value integer not null default 1 check (target_value >= 0),
  reward_points integer not null default 0 check (reward_points >= 0),
  badge_name text,
  target_segment text not null default 'All Members',
  start_date timestamptz not null default now(),
  end_date timestamptz not null default (now() + interval '30 days'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.surveys (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text not null default '',
  segment text not null default 'All Members',
  bonus_points integer not null default 0 check (bonus_points >= 0),
  status text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id text primary key default gen_random_uuid()::text,
  survey_id text not null,
  prompt text not null,
  question_type text not null default 'multiple-choice'
    check (question_type in ('multiple-choice', 'rating', 'free-text')),
  options jsonb,
  display_order integer not null default 1 check (display_order >= 1),
  created_at timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id text primary key default gen_random_uuid()::text,
  survey_id text not null,
  member_id text not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (survey_id, member_id)
);

create table if not exists public.member_engagement_settings (
  member_id text primary key,
  privacy_settings jsonb not null default '{"showName":true,"showReferralCode":true,"publicProfile":true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_share_events (
  id bigserial primary key,
  member_id bigint not null,
  referral_id text,
  referral_code text,
  channel text not null,
  achievement text not null,
  tier_at_share text,
  badge_label text,
  share_text text,
  destination_url text,
  conversion_count integer not null default 0 check (conversion_count >= 0),
  last_converted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace view public.challenge_leaderboard_view as
select
  null::text as challenge_id,
  null::text as member_id,
  null::text as member_name,
  null::text as member_number,
  null::text as tier,
  0::integer as current_value,
  0::integer as leaderboard_rank
where false;

create index if not exists idx_challenges_active_dates on public.challenges(is_active, start_date, end_date);
create index if not exists idx_survey_questions_survey on public.survey_questions(survey_id, display_order);
create index if not exists idx_survey_responses_survey on public.survey_responses(survey_id, submitted_at desc);
create index if not exists idx_survey_responses_member on public.survey_responses(member_id, submitted_at desc);
create index if not exists idx_social_share_events_member on public.social_share_events(member_id, created_at desc);
