create table public.competitor_snapshots (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 name text not null, domain text not null, similarity numeric(4,3) not null check(similarity between 0 and 1),
 inventory jsonb not null, evidence jsonb not null default '[]'::jsonb,
 captured_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index competitor_snapshots_site_captured_idx on public.competitor_snapshots(site_id,captured_at desc);
create index competitor_snapshots_site_domain_idx on public.competitor_snapshots(site_id,domain,captured_at desc);
alter table public.competitor_snapshots enable row level security;
revoke all on public.competitor_snapshots from anon,authenticated;
grant select on public.competitor_snapshots to authenticated;
create policy competitor_snapshots_read on public.competitor_snapshots for select to authenticated using(public.can_read_site(site_id));
