create table public.website_snapshots (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 url text not null,
 routes jsonb not null default '[]'::jsonb,
 features jsonb not null default '[]'::jsonb,
 technologies jsonb not null default '[]'::jsonb,
 captured_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index website_snapshots_site_captured_idx on public.website_snapshots(site_id,captured_at desc);

create table public.qa_findings (
 id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null references public.website_snapshots(id) on delete cascade,
 site_id uuid not null references public.sites(id) on delete cascade,
 finding_key text not null,
 category text not null check(category in ('availability','content','navigation','security','performance','accessibility')),
 severity text not null check(severity in ('critical','high','medium','low')),
 title text not null,
 evidence text not null,
 created_at timestamptz not null default now(),
 unique(snapshot_id,finding_key)
);
create index qa_findings_site_severity_idx on public.qa_findings(site_id,severity,created_at desc);

alter table public.website_snapshots enable row level security;
alter table public.qa_findings enable row level security;
revoke all on public.website_snapshots,public.qa_findings from anon,authenticated;
grant select on public.website_snapshots,public.qa_findings to authenticated;
create policy website_snapshots_read on public.website_snapshots for select to authenticated using (public.can_read_site(site_id));
create policy qa_findings_read on public.qa_findings for select to authenticated using (public.can_read_site(site_id));
