-- Project OS compatibility hardening.
-- Keep provider capabilities discoverable without changing existing execution policy semantics.
alter table public.integration_capabilities add column if not exists enabled boolean not null default true;

-- Explicit status checks for Project OS records introduced as text so future UI/API writes fail closed.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='project_execution_status_check') then
    alter table public.project_executions add constraint project_execution_status_check
      check(status in('queued','running','paused','blocked','completed','failed','cancelled')) not valid;
    alter table public.project_executions validate constraint project_execution_status_check;
  end if;
  if not exists(select 1 from pg_constraint where conname='project_task_run_status_check') then
    alter table public.project_task_runs add constraint project_task_run_status_check
      check(status in('queued','running','waiting_for_agent','waiting_for_data','waiting_for_connection','waiting_for_approval','blocked','retrying','completed','failed','cancelled')) not valid;
    alter table public.project_task_runs validate constraint project_task_run_status_check;
  end if;
  if not exists(select 1 from pg_constraint where conname='project_proposal_status_check') then
    alter table public.project_proposals add constraint project_proposal_status_check
      check(status in('draft','internal_review','ready_for_executive','approved','rejected','needs_revision','executing','completed','measured')) not valid;
    alter table public.project_proposals validate constraint project_proposal_status_check;
  end if;
end $$;

-- Scheduler-visible heartbeat health view. No secrets or document content are exposed.
create or replace view public.project_execution_health_v1
with (security_invoker=true)
as
select
  p.organization_id,p.id as project_id,p.name,p.status as project_status,p.last_heartbeat_at,
  pe.id as execution_id,pe.status as execution_status,pe.last_heartbeat_at as execution_heartbeat,
  count(tr.id) filter(where tr.status='running') as running_tasks,
  count(tr.id) filter(where tr.status='retrying') as retrying_tasks,
  count(tr.id) filter(where tr.status='failed') as failed_tasks,
  count(tr.id) filter(where tr.status='waiting_for_approval') as waiting_approval_tasks,
  count(tr.id) filter(where tr.status='waiting_for_connection') as waiting_connection_tasks
from public.projects p
left join lateral(select x.* from public.project_executions x where x.project_id=p.id order by x.execution_no desc limit 1) pe on true
left join public.project_task_runs tr on tr.execution_id=pe.id
group by p.organization_id,p.id,p.name,p.status,p.last_heartbeat_at,pe.id,pe.status,pe.last_heartbeat_at;
revoke all on public.project_execution_health_v1 from public,anon;
grant select on public.project_execution_health_v1 to authenticated,service_role;

-- A reusable capability contract for future real cloud-computer providers. This does NOT pretend
-- a browser provider exists; sessions may only be created once an implementation/provider is registered.
create table if not exists public.execution_capability_catalog(
  capability_key text primary key,
  display_name text not null,
  category text not null,
  risk_level text not null,
  requires_cloud_provider boolean not null default false,
  enabled boolean not null default true,
  description text not null,
  created_at timestamptz not null default now()
);
insert into public.execution_capability_catalog(capability_key,display_name,category,risk_level,requires_cloud_provider,enabled,description)
values('computer.use','Computer Use','digital_operator','high',true,false,'Reusable cloud computer/browser interaction capability. Disabled until an approved cloud execution provider and credential-isolation path are configured.')
on conflict(capability_key) do update set display_name=excluded.display_name,category=excluded.category,risk_level=excluded.risk_level,requires_cloud_provider=excluded.requires_cloud_provider,description=excluded.description;
revoke all on public.execution_capability_catalog from public,anon;
grant select on public.execution_capability_catalog to authenticated,service_role;
