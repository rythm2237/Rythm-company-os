-- W03 (safe reapplication on Production/staging with differing migration ledgers): a tenant-owned child must reference a project in that same tenant.
-- NOT VALID protects every new INSERT/UPDATE without rewriting or silently
-- repairing historical data. Validate after the owner-reviewed preflight audit.
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_id_organization_w03_key') then
    alter table public.projects add constraint projects_id_organization_w03_key unique(id,organization_id);
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.project_executions'::regclass and conname='project_executions_id_project_organization_w03_key') then
    alter table public.project_executions add constraint project_executions_id_project_organization_w03_key unique(id,project_id,organization_id);
  end if;
end $w03_guard$;

do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.project_decision_memory'::regclass and conname='project_decision_memory_project_tenant_w03_fk') then
    alter table public.project_decision_memory add constraint project_decision_memory_project_tenant_w03_fk
 foreign key(project_id,organization_id) references public.projects(id,organization_id) on delete cascade not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.project_task_runs'::regclass and conname='project_task_runs_project_tenant_w03_fk') then
    alter table public.project_task_runs add constraint project_task_runs_project_tenant_w03_fk
 foreign key(project_id,organization_id) references public.projects(id,organization_id) on delete cascade not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.project_task_runs'::regclass and conname='project_task_runs_execution_tenant_w03_fk') then
    alter table public.project_task_runs add constraint project_task_runs_execution_tenant_w03_fk
 foreign key(execution_id,project_id,organization_id) references public.project_executions(id,project_id,organization_id) on delete cascade not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.tool_execution_requests'::regclass and conname='tool_execution_requests_project_tenant_w03_fk') then
    alter table public.tool_execution_requests add constraint tool_execution_requests_project_tenant_w03_fk
 foreign key(project_id,organization_id) references public.projects(id,organization_id) not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.agents'::regclass and conname='agents_id_organization_w03_key') then
    alter table public.agents add constraint agents_id_organization_w03_key unique(id,organization_id);
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.action_items'::regclass and conname='action_items_id_organization_w03_key') then
    alter table public.action_items add constraint action_items_id_organization_w03_key unique(id,organization_id);
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.project_task_runs'::regclass and conname='project_task_runs_agent_tenant_w03_fk') then
    alter table public.project_task_runs add constraint project_task_runs_agent_tenant_w03_fk
 foreign key(assigned_agent_id,organization_id) references public.agents(id,organization_id) on delete set null (assigned_agent_id) not valid;
  end if;
end $w03_guard$;
do $w03_guard$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.project_task_runs'::regclass and conname='project_task_runs_action_tenant_w03_fk') then
    alter table public.project_task_runs add constraint project_task_runs_action_tenant_w03_fk
 foreign key(action_item_id,organization_id) references public.action_items(id,organization_id) on delete set null (action_item_id) not valid;
  end if;
end $w03_guard$;
