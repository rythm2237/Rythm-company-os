-- Project roadmap baselines: execution progress is measured against an approved plan,
-- never raw completed task count. Additive and backward-compatible.

create table if not exists public.project_roadmaps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  title text not null,
  summary text not null default '',
  status text not null default 'draft',
  is_baseline boolean not null default false,
  generated_from jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, version),
  constraint project_roadmaps_status_check check (status in ('draft','in_review','approved','superseded','rejected'))
);

create unique index if not exists project_roadmaps_one_baseline_idx
  on public.project_roadmaps(project_id)
  where is_baseline = true and status = 'approved';

create table if not exists public.project_roadmap_phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  roadmap_id uuid not null references public.project_roadmaps(id) on delete cascade,
  phase_key text not null,
  phase_order integer not null,
  title text not null,
  description text not null default '',
  milestone text,
  weight numeric(7,4) not null,
  status text not null default 'not_started',
  outcome_progress_percent numeric(5,2),
  deliverables jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  owner_agent_ids jsonb not null default '[]'::jsonb,
  estimated_duration text,
  required_connections jsonb not null default '[]'::jsonb,
  required_approvals jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(roadmap_id, phase_key),
  constraint project_roadmap_phase_weight_check check (weight > 0 and weight <= 100),
  constraint project_roadmap_phase_status_check check (status in ('not_started','in_progress','blocked','monitoring','completed')),
  constraint project_roadmap_phase_outcome_check check (outcome_progress_percent is null or (outcome_progress_percent between 0 and 100))
);

alter table public.project_task_runs add column if not exists roadmap_id uuid references public.project_roadmaps(id) on delete set null;
alter table public.project_task_runs add column if not exists roadmap_phase_id uuid references public.project_roadmap_phases(id) on delete set null;
alter table public.project_task_runs add column if not exists work_weight numeric(9,4) not null default 1;
alter table public.project_executions add column if not exists roadmap_id uuid references public.project_roadmaps(id) on delete set null;

create index if not exists project_roadmaps_project_status_idx on public.project_roadmaps(project_id,status,version desc);
create index if not exists project_roadmap_phases_roadmap_order_idx on public.project_roadmap_phases(roadmap_id,phase_order);
create index if not exists project_task_runs_roadmap_phase_idx on public.project_task_runs(roadmap_phase_id,status);

alter table public.project_roadmaps enable row level security;
alter table public.project_roadmap_phases enable row level security;

drop policy if exists project_roadmaps_member_read on public.project_roadmaps;
create policy project_roadmaps_member_read on public.project_roadmaps
for select to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id=project_roadmaps.organization_id and m.user_id=auth.uid()
));

drop policy if exists project_roadmaps_owner_write on public.project_roadmaps;
create policy project_roadmaps_owner_write on public.project_roadmaps
for all to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id=project_roadmaps.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
))
with check (exists (
  select 1 from public.organization_members m
  where m.organization_id=project_roadmaps.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));

drop policy if exists project_roadmap_phases_member_read on public.project_roadmap_phases;
create policy project_roadmap_phases_member_read on public.project_roadmap_phases
for select to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id=project_roadmap_phases.organization_id and m.user_id=auth.uid()
));

drop policy if exists project_roadmap_phases_owner_write on public.project_roadmap_phases;
create policy project_roadmap_phases_owner_write on public.project_roadmap_phases
for all to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id=project_roadmap_phases.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
))
with check (exists (
  select 1 from public.organization_members m
  where m.organization_id=project_roadmap_phases.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')
));

-- Canonical project progress: approved baseline roadmap + weighted phase work.
-- A project without an approved roadmap has no execution baseline, so cached progress is 0
-- unless the project itself is terminally completed.
create or replace function public.refresh_project_progress_percent_v1(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roadmap_id uuid;
  v_percent numeric := 0;
  v_project_status text;
begin
  select status into v_project_status from public.projects where id=p_project_id;
  select id into v_roadmap_id
  from public.project_roadmaps
  where project_id=p_project_id and status='approved' and is_baseline=true
  order by version desc limit 1;

  if v_roadmap_id is null then
    v_percent := case when v_project_status='completed' then 100 else 0 end;
  else
    with phase_progress as (
      select p.id,p.weight,
        case
          when count(t.id) filter (where t.status <> 'cancelled') = 0 then
            case when p.status='completed' then 100 else 0 end
          else
            100 * coalesce(sum(t.work_weight) filter (where t.status='completed'),0)
                / nullif(sum(t.work_weight) filter (where t.status <> 'cancelled'),0)
        end as pct
      from public.project_roadmap_phases p
      left join public.project_task_runs t on t.roadmap_phase_id=p.id and t.roadmap_id=v_roadmap_id
      where p.roadmap_id=v_roadmap_id
      group by p.id,p.weight,p.status
    )
    select coalesce(sum(weight * pct) / nullif(sum(weight),0) / 100 * 100,0)
      into v_percent from phase_progress;
  end if;

  v_percent := greatest(0,least(100,round(coalesce(v_percent,0))));
  update public.projects set progress_percent=v_percent::integer
  where id=p_project_id and progress_percent is distinct from v_percent::integer;
  return v_percent::integer;
end;
$$;

-- Roadmap/phase updates can affect canonical project progress too.
create or replace function public.sync_roadmap_project_progress_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.refresh_project_progress_percent_v1(coalesce(new.project_id,old.project_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists project_roadmaps_sync_progress_v1 on public.project_roadmaps;
create trigger project_roadmaps_sync_progress_v1
after insert or update of status,is_baseline or delete on public.project_roadmaps
for each row execute function public.sync_roadmap_project_progress_v1();

drop trigger if exists project_roadmap_phases_sync_progress_v1 on public.project_roadmap_phases;
create trigger project_roadmap_phases_sync_progress_v1
after insert or update of status,weight,outcome_progress_percent or delete on public.project_roadmap_phases
for each row execute function public.sync_roadmap_project_progress_v1();

revoke all on function public.refresh_project_progress_percent_v1(uuid) from public,anon,authenticated;
revoke all on function public.sync_roadmap_project_progress_v1() from public,anon,authenticated;
grant execute on function public.refresh_project_progress_percent_v1(uuid) to service_role;
