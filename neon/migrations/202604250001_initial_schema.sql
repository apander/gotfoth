-- Core schema for Gotfoth on Neon Postgres
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'paper_status') then
    create type public.paper_status as enum ('Planned', 'Completed', 'Marked', 'Graded');
  end if;
end
$$;

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  legacy_pocketbase_id text unique,
  subject text not null check (subject in ('Psychology', 'Business Studies')),
  year text,
  paper_type text not null,
  status public.paper_status not null default 'Planned',
  scheduled_date timestamptz,
  score integer check (score is null or (score >= 0 and score <= 100)),
  max_score integer,
  ai_summary text,
  full_yaml text,
  file_paper_path text,
  file_scheme_path text,
  file_attempt_path text,
  file_marking_yaml_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists papers_scheduled_date_idx on public.papers (scheduled_date);
create index if not exists papers_status_idx on public.papers (status);
create index if not exists papers_subject_year_idx on public.papers (subject, year);

create table if not exists public.boundaries (
  id uuid primary key default gen_random_uuid(),
  paper_key text not null unique,
  max_mark integer,
  a_star integer,
  a integer,
  b integer,
  c integer,
  d integer,
  e integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists papers_set_updated_at on public.papers;
create trigger papers_set_updated_at
before update on public.papers
for each row execute function public.set_updated_at();

drop trigger if exists boundaries_set_updated_at on public.boundaries;
create trigger boundaries_set_updated_at
before update on public.boundaries
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();
