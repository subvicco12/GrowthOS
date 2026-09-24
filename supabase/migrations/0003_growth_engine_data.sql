create table if not exists public.growth_signals (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 category text not null,
 title text not null,
 description text not null default '',
 evidence jsonb not null default '[]'::jsonb,
 impact integer not null check (impact between 1 and 5),
 confidence integer not null check (confidence between 1 and 5),
 effort integer not null check (effort between 1 and 5),
 recurring_cost_usd numeric(12,2) not null default 0,
 risk integer not null check (risk between 1 and 5),
 approval_class text not null check (approval_class in ('green','amber','red')),
 success_metric text not null,
 score numeric(12,4) not null default 0,
 status text not null default 'open' check (status in ('open','approved','rejected','deferred','implemented','verified')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists growth_signals_site_score_idx on public.growth_signals(site_id,score desc,status);

create table if not exists public.engineering_work_items (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 recommendation_id uuid,
 title text not null,
 stage text not null check(stage in ('recommendation','approval','issue','branch','code','test','pr','review','merge','deploy','verify','measure')),
 github_issue_url text,
 github_pr_url text,
 commit_sha text,
 deployment_id text,
 verification_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists engineering_work_items_site_stage_idx on public.engineering_work_items(site_id,stage);

alter table public.growth_signals enable row level security;
alter table public.engineering_work_items enable row level security;
create policy "members read growth signals" on public.growth_signals for select to authenticated using (
 exists(select 1 from public.site_members sm where sm.site_id=growth_signals.site_id and sm.user_id=(select auth.uid()))
);
create policy "members read engineering work" on public.engineering_work_items for select to authenticated using (
 exists(select 1 from public.site_members sm where sm.site_id=engineering_work_items.site_id and sm.user_id=(select auth.uid()))
);
