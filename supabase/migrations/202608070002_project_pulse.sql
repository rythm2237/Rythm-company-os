-- RYTHM Project Pulse — reusable persisted project-progress event model.
-- This migration is additive and idempotent. It consumes existing project state;
-- it does not hard-code global progress increments.

create table if not exists public.project_progress_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_code text not null,
  label text not null,
  sequence_no smallint not null,
  weight_percent numeric(5,2) not null default 0 check (weight_percent >= 0 and weight_percent <= 100),
  node_type text not null default 'milestone' check (node_type in ('milestone','approval_gate','phase','release_gate')),
  created_at timestamptz not null default now(),
  unique(project_id, stage_code),
  unique(project_id, sequence_no)
);

create table if not exists public.project_progress_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null,
  event_label text not null,
  previous_progress smallint not null check (previous_progress between 0 and 100),
  new_progress smallint not null check (new_progress between 0 and 100),
  previous_node text,
  new_node text,
  event_state text not null default 'current' check (event_state in ('completed','current','upcoming','blocked','waiting_approval')),
  next_step text,
  source_type text,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_progress_nodes enable row level security;
alter table public.project_progress_events enable row level security;

drop policy if exists project_progress_nodes_member_read on public.project_progress_nodes;
create policy project_progress_nodes_member_read on public.project_progress_nodes for select using (public.is_org_member(organization_id));
drop policy if exists project_progress_nodes_owner_write on public.project_progress_nodes;
create policy project_progress_nodes_owner_write on public.project_progress_nodes for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists project_progress_events_member_read on public.project_progress_events;
create policy project_progress_events_member_read on public.project_progress_events for select using (public.is_org_member(organization_id));
drop policy if exists project_progress_events_owner_write on public.project_progress_events;
create policy project_progress_events_owner_write on public.project_progress_events for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

create index if not exists project_progress_nodes_project_idx on public.project_progress_nodes(project_id, sequence_no);
create index if not exists project_progress_events_project_idx on public.project_progress_events(project_id, created_at desc);
create index if not exists project_progress_events_org_idx on public.project_progress_events(organization_id, created_at desc);

-- Generic helper for governed backend transitions. Callers provide the actual
-- project-derived before/after values; the Pulse renderer never invents progress.
create or replace function public.record_project_progress_event(
  target_project_id uuid,
  target_event_type text,
  target_event_label text,
  target_previous_progress smallint,
  target_new_progress smallint,
  target_previous_node text,
  target_new_node text,
  target_event_state text,
  target_next_step text default null,
  target_source_type text default null,
  target_source_id uuid default null,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_org_id uuid;
  created_id uuid;
begin
  select organization_id into target_org_id from public.projects where id = target_project_id;
  if target_org_id is null then raise exception 'Project not found'; end if;

  insert into public.project_progress_events(
    organization_id, project_id, event_type, event_label,
    previous_progress, new_progress, previous_node, new_node,
    event_state, next_step, source_type, source_id, metadata
  ) values (
    target_org_id, target_project_id, target_event_type, target_event_label,
    target_previous_progress, target_new_progress, target_previous_node, target_new_node,
    target_event_state, target_next_step, target_source_type, target_source_id, coalesce(target_metadata,'{}'::jsonb)
  ) returning id into created_id;

  return created_id;
end $$;

-- AI-PR-001 visual roadmap configuration. Weights are project-specific and sum to 100.
-- Completed state before Execution Planning = 15+15+15+20 = 65.
insert into public.project_progress_nodes(organization_id, project_id, stage_code, label, sequence_no, weight_percent, node_type)
select p.organization_id, p.id, n.stage_code, n.label, n.sequence_no, n.weight_percent, n.node_type
from public.projects p
cross join (values
  ('project_setup','Project Setup',1::smallint,15::numeric,'milestone'),
  ('resource_validation','Resource Validation',2::smallint,15::numeric,'milestone'),
  ('strategy_preparation','Strategy Preparation',3::smallint,15::numeric,'milestone'),
  ('executive_decision','Executive Decision',4::smallint,20::numeric,'approval_gate'),
  ('execution_planning','Execution Planning',5::smallint,10::numeric,'approval_gate'),
  ('controlled_validation','Controlled Validation',6::smallint,10::numeric,'phase'),
  ('limited_beta','Limited Beta',7::smallint,10::numeric,'release_gate'),
  ('commercial_release','Commercial Release',8::smallint,5::numeric,'release_gate')
) as n(stage_code,label,sequence_no,weight_percent,node_type)
where p.project_code = 'AI-PR-001'
on conflict (project_id, stage_code) do update set
  label = excluded.label,
  sequence_no = excluded.sequence_no,
  weight_percent = excluded.weight_percent,
  node_type = excluded.node_type;

-- Persist the first real Pulse state. Execution Planning is open, but the token
-- must not pass the approval gate until the Human CEO approves the plan.
insert into public.project_progress_events(
  organization_id, project_id, event_type, event_label,
  previous_progress, new_progress, previous_node, new_node,
  event_state, next_step, source_type, source_id, metadata
)
select
  p.organization_id,
  p.id,
  'project.milestone_reached',
  'Execution Planning opened — approval required',
  least(p.progress_percent,65),
  p.progress_percent,
  'executive_decision',
  'execution_planning',
  'waiting_approval',
  'Approve the governed 90-day execution plan before execution progress is awarded.',
  'decision',
  d.id,
  jsonb_build_object('decision_key',d.decision_key,'approval_gate','project_execution_plan','external_actions',false)
from public.projects p
join public.decisions d on d.project_id=p.id and d.decision_key='AI-PR-001-DEC-001' and d.status='approved'
where p.project_code='AI-PR-001'
  and p.stage='execution_planning'
  and not exists (
    select 1 from public.project_progress_events e
    where e.project_id=p.id
      and e.event_type='project.milestone_reached'
      and e.new_node='execution_planning'
      and e.event_state='waiting_approval'
  );

-- Extend the existing execution-plan approval transition with a real persisted Pulse event.
create or replace function public.apply_execution_plan_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_progress smallint;
begin
  if new.subject_type = 'project_execution_plan'
     and new.project_id is not null
     and old.status = 'pending'
     and new.status in ('approved','rejected') then

    select progress_percent into old_progress from public.projects where id = new.project_id;

    if new.status = 'approved' then
      update public.project_milestones
      set status = 'completed', completed_at = coalesce(completed_at, now())
      where project_id = new.project_id and sequence_no = 5;

      update public.projects
      set progress_percent = greatest(progress_percent, 75),
          stage = 'execution_ready',
          updated_at = now()
      where id = new.project_id;

      perform public.record_project_progress_event(
        new.project_id,
        'approval.approved',
        'Execution Planning Reached',
        coalesce(old_progress,65),
        greatest(coalesce(old_progress,65),75)::smallint,
        'executive_decision',
        'execution_planning',
        'current',
        'Begin Phase 1 — Focus and Truth under the approved 90-day plan.',
        'approval_request',
        new.id,
        jsonb_build_object('approval_status','approved','external_actions',false)
      );
    else
      update public.project_milestones
      set status = 'blocked'
      where project_id = new.project_id and sequence_no = 5 and status <> 'completed';

      update public.projects
      set status = 'blocked', stage = 'execution_planning', updated_at = now()
      where id = new.project_id;

      perform public.record_project_progress_event(
        new.project_id,
        'project.blocked',
        'Execution Planning blocked',
        coalesce(old_progress,65),
        coalesce(old_progress,65),
        'executive_decision',
        'execution_planning',
        'blocked',
        'Revise the execution plan and resolve the CEO approval gate.',
        'approval_request',
        new.id,
        jsonb_build_object('approval_status','rejected','external_actions',false)
      );
    end if;
  end if;
  return new;
end $$;

-- Trigger was created by the prior execution-planning migration; recreate safely.
drop trigger if exists trg_apply_execution_plan_approval on public.approval_requests;
create trigger trg_apply_execution_plan_approval
after update of status on public.approval_requests
for each row execute function public.apply_execution_plan_approval();
