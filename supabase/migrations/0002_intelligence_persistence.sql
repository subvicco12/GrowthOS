-- GrowthOS Final Blueprint: intelligence persistence
create table if not exists public.website_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  captured_at timestamptz not null,
  source text not null check (source in ('connector','crawl','manual')),
  url text not null,
  routes jsonb not null default '[]'::jsonb,
  technologies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_snapshots_site_captured_idx
  on public.website_snapshots(site_id,captured_at desc);

create table if not exists public.discovered_features (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  snapshot_id uuid references public.website_snapshots(id) on delete set null,
  feature_key text not null,
  name text not null,
  category text not null,
  source text not null,
  confidence text not null check (confidence in ('high','medium','low')),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(site_id,feature_key,snapshot_id)
);

create index if not exists discovered_features_site_idx
  on public.discovered_features(site_id,feature_key);

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  domain text not null,
  category text,
  similarity numeric(5,4),
  evidence_url text not null,
  status text not null default 'active' check (status in ('active','paused','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id,domain)
);

create index if not exists competitors_site_similarity_idx
  on public.competitors(site_id,similarity desc);

create table if not exists public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  captured_at timestamptz not null,
  evidence_url text not null,
  product_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists competitor_snapshots_competitor_captured_idx
  on public.competitor_snapshots(competitor_id,captured_at desc);

create table if not exists public.competitor_packages (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.competitor_snapshots(id) on delete cascade,
  plan_key text not null check (plan_key in ('free','pro','business')),
  plan_name text not null,
  price_amount numeric(12,2),
  currency char(3),
  billing_period text,
  feature_keys jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists competitor_packages_snapshot_plan_idx
  on public.competitor_packages(snapshot_id,plan_key);

create table if not exists public.package_comparisons (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  compared_at timestamptz not null,
  competitor_snapshot_ids jsonb not null default '[]'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists package_comparisons_site_compared_idx
  on public.package_comparisons(site_id,compared_at desc);

alter table public.website_snapshots enable row level security;
alter table public.discovered_features enable row level security;
alter table public.competitors enable row level security;
alter table public.competitor_snapshots enable row level security;
alter table public.competitor_packages enable row level security;
alter table public.package_comparisons enable row level security;

create policy "members read website snapshots" on public.website_snapshots for select to authenticated using (
  exists (select 1 from public.site_members sm where sm.site_id=website_snapshots.site_id and sm.user_id=(select auth.uid()))
);
create policy "members read discovered features" on public.discovered_features for select to authenticated using (
  exists (select 1 from public.site_members sm where sm.site_id=discovered_features.site_id and sm.user_id=(select auth.uid()))
);
create policy "members read competitors" on public.competitors for select to authenticated using (
  exists (select 1 from public.site_members sm where sm.site_id=competitors.site_id and sm.user_id=(select auth.uid()))
);
create policy "members read competitor snapshots" on public.competitor_snapshots for select to authenticated using (
  exists (
    select 1 from public.competitors c
    join public.site_members sm on sm.site_id=c.site_id
    where c.id=competitor_snapshots.competitor_id and sm.user_id=(select auth.uid())
  )
);
create policy "members read competitor packages" on public.competitor_packages for select to authenticated using (
  exists (
    select 1 from public.competitor_snapshots cs
    join public.competitors c on c.id=cs.competitor_id
    join public.site_members sm on sm.site_id=c.site_id
    where cs.id=competitor_packages.snapshot_id and sm.user_id=(select auth.uid())
  )
);
create policy "members read package comparisons" on public.package_comparisons for select to authenticated using (
  exists (select 1 from public.site_members sm where sm.site_id=package_comparisons.site_id and sm.user_id=(select auth.uid()))
);
