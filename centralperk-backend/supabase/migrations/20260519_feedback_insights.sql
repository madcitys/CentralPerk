-- Apply in the Member Service Supabase project.
create table if not exists public.feedback_insights (
  id text primary key default gen_random_uuid()::text,
  sentiment_split jsonb not null default '{"positive":0,"neutral":0,"negative":0}'::jsonb,
  word_cloud jsonb not null default '[]'::jsonb,
  top_topics jsonb not null default '[]'::jsonb,
  similar_feedback_groups jsonb not null default '[]'::jsonb,
  source_count integer not null default 0 check (source_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.feedback_insights add column if not exists id text;
alter table public.feedback_insights add column if not exists sentiment_split jsonb default '{"positive":0,"neutral":0,"negative":0}'::jsonb;
alter table public.feedback_insights add column if not exists word_cloud jsonb default '[]'::jsonb;
alter table public.feedback_insights add column if not exists top_topics jsonb default '[]'::jsonb;
alter table public.feedback_insights add column if not exists similar_feedback_groups jsonb default '[]'::jsonb;
alter table public.feedback_insights add column if not exists source_count integer default 0;
alter table public.feedback_insights add column if not exists created_at timestamptz default now();

create index if not exists idx_feedback_insights_created
on public.feedback_insights(created_at desc);
