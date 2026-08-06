-- Connect governed company engines to the Project Workspace.

alter table public.approval_requests add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.decisions add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.meetings add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.action_items add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.agent_runs add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists approval_requests_project_idx on public.approval_requests(project_id, status);
create index if not exists decisions_project_idx on public.decisions(project_id, status);
create index if not exists meetings_project_idx on public.meetings(project_id, status);
create index if not exists action_items_project_idx on public.action_items(project_id, status, priority);
create index if not exists agent_runs_project_idx on public.agent_runs(project_id, status);

-- Ensure the first workspace reflects completion of the workspace foundation itself.
update public.project_milestones milestone
set status = 'completed', completed_at = coalesce(completed_at, now())
from public.projects project
where milestone.project_id = project.id
  and project.project_code = 'AI-PR-001'
  and milestone.sequence_no = 1;

update public.projects
set progress_percent = greatest(progress_percent, 25),
    stage = 'resource_validation',
    updated_at = now()
where project_code = 'AI-PR-001';

update public.project_kpis kpi
set current_value = 25,
    status = 'on_track'
from public.projects project
where kpi.project_id = project.id
  and project.project_code = 'AI-PR-001'
  and kpi.name = 'Project onboarding completion';
