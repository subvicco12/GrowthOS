-- GrowthOS final control-plane expansion.
-- All public tables are RLS protected and grants are explicit.

create type public.growthos_plan as enum ('free','pro','business');
create type public.growthos_feature_mode as enum ('on','off','maintenance','beta','admin_only');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.growthos_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

alter table public.sites add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (name in ('development','staging','production')),
  base_url text not null,
  is_production boolean not null default false,
  created_at timestamptz not null default now(),
  unique(site_id,name)
);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  environment_id uuid references public.environments(id) on delete cascade,
  kind text not null,
  status text not null default 'needs_connection' check (status in ('needs_connection','connected','degraded','disabled')),
  secret_fingerprint text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  code public.growthos_plan not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(site_id,code)
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  feature_key text not null,
  mode public.growthos_feature_mode not null default 'off',
  free_access boolean not null default false,
  pro_access boolean not null default false,
  business_access boolean not null default false,
  quota_free bigint check (quota_free is null or quota_free >= 0),
  quota_pro bigint check (quota_pro is null or quota_pro >= 0),
  quota_business bigint check (quota_business is null or quota_business >= 0),
  rollout_percent smallint not null default 100 check (rollout_percent between 0 and 100),
  emergency_kill boolean not null default false,
  customer_message text,
  fail_safe text not null default 'deny' check (fail_safe in ('deny','allow_read_only')),
  updated_at timestamptz not null default now(),
  unique(site_id,feature_key)
);

create table public.connector_nonces (
  site_id uuid not null references public.sites(id) on delete cascade,
  nonce text not null,
  expires_at timestamptz not null,
  primary key(site_id,nonce)
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  category text not null,
  title text not null,
  evidence jsonb not null default '[]'::jsonb,
  impact smallint not null check (impact between 1 and 5),
  confidence smallint not null check (confidence between 1 and 5),
  effort smallint not null check (effort between 1 and 5),
  recurring_cost_usd numeric(12,2) not null default 0 check (recurring_cost_usd >= 0),
  risk smallint not null check (risk between 1 and 5),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','deferred','implemented','verified')),
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('approved','rejected','deferred')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.environments enable row level security;
alter table public.connectors enable row level security;
alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
alter table public.connector_nonces enable row level security;
alter table public.recommendations enable row level security;
alter table public.approvals enable row level security;

create policy "organization members read organizations" on public.organizations for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=id and m.user_id=(select auth.uid())));
-- A member reads only their own membership rows. This avoids a self-referential RLS policy
-- on organization_members while still allowing the organizations membership predicate above.
create policy "members read own organization memberships" on public.organization_members for select to authenticated
using (user_id=(select auth.uid()));
create policy "site members read environments" on public.environments for select to authenticated
using (exists (select 1 from public.site_members m where m.site_id=environments.site_id and m.user_id=(select auth.uid())));
create policy "site members read connectors" on public.connectors for select to authenticated
using (exists (select 1 from public.site_members m where m.site_id=connectors.site_id and m.user_id=(select auth.uid())));
create policy "site members read plans" on public.plans for select to authenticated
using (exists (select 1 from public.site_members m where m.site_id=plans.site_id and m.user_id=(select auth.uid())));
create policy "site members read entitlements" on public.entitlements for select to authenticated
using (exists (select 1 from public.site_members m where m.site_id=entitlements.site_id and m.user_id=(select auth.uid())));
create policy "site members read recommendations" on public.recommendations for select to authenticated
using (exists (select 1 from public.site_members m where m.site_id=recommendations.site_id and m.user_id=(select auth.uid())));
create policy "site members read approvals" on public.approvals for select to authenticated
using (exists (select 1 from public.recommendations r join public.site_members m on m.site_id=r.site_id where r.id=approvals.recommendation_id and m.user_id=(select auth.uid())));

-- Client access is read-only for the control-plane tables; all mutations go through
-- server-side authorization and audited service operations.
revoke all on public.organizations, public.organization_members, public.environments, public.connectors, public.plans, public.entitlements, public.recommendations, public.approvals from anon, authenticated;
grant select on public.organizations, public.organization_members, public.environments, public.connectors, public.plans, public.entitlements, public.recommendations, public.approvals to authenticated;
-- connector_nonces is deliberately service-only.
revoke all on public.connector_nonces from anon, authenticated;
