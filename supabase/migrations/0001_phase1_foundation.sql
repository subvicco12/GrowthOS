-- GrowthOS Phase 1 foundation schema
create extension if not exists pgcrypto;

create type public.growthos_role as enum ('owner','admin','operator','analyst','viewer');
create type public.site_status as enum ('active','paused','maintenance','disconnected');
create type public.feature_state as enum ('enabled','disabled','maintenance');
create type public.job_status as enum ('queued','running','succeeded','failed','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.growthos_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  platform text not null check (platform in ('wordpress','custom')),
  status public.site_status not null default 'disconnected',
  connector_version text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_members (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.growthos_role not null,
  primary key (site_id,user_id)
);

create table public.feature_controls (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  feature_key text not null,
  state public.feature_state not null default 'enabled',
  reason text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(site_id,feature_key)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id) on delete cascade,
  type text not null,
  status public.job_status not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  idempotency_key text not null unique,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.ai_budgets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id) on delete cascade,
  provider text not null,
  model text not null,
  monthly_limit_usd numeric(12,2) not null default 0,
  spent_usd numeric(12,4) not null default 0,
  enabled boolean not null default true
);

-- PostgreSQL treats NULL values as distinct in a normal UNIQUE constraint.
-- Split global and per-site uniqueness so one authoritative budget exists per scope/model.
create unique index ai_budgets_site_provider_model_uidx
  on public.ai_budgets(site_id, provider, model)
  where site_id is not null;
create unique index ai_budgets_global_provider_model_uidx
  on public.ai_budgets(provider, model)
  where site_id is null;

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.site_members enable row level security;
alter table public.feature_controls enable row level security;
alter table public.jobs enable row level security;
alter table public.audit_events enable row level security;
alter table public.ai_budgets enable row level security;

-- Server-side authorization is mandatory. Service-role operations must remain server-only.
create policy "users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "members read sites" on public.sites for select to authenticated using (
  exists (select 1 from public.site_members sm where sm.site_id = sites.id and sm.user_id = (select auth.uid()))
);
create policy "members read memberships" on public.site_members for select to authenticated using (user_id = (select auth.uid()));
create policy "members read feature controls" on public.feature_controls for select to authenticated using (
  exists (select 1 from public.site_members sm where sm.site_id = feature_controls.site_id and sm.user_id = (select auth.uid()))
);
