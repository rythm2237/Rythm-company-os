-- Keep the existing single-column delete behavior authoritative while the
-- composite foreign keys enforce only the tenant-boundary invariant.
-- The composite constraints intentionally have no delete action of their own,
-- so organization_id can never be nulled by a relationship cleanup.

alter table public.agents
  drop constraint if exists agents_organization_department_tenant_fkey;
alter table public.agents
  add constraint agents_organization_department_tenant_fkey
  foreign key (organization_id, department_id)
  references public.departments (organization_id, id)
  not valid;
alter table public.agents
  validate constraint agents_organization_department_tenant_fkey;

alter table public.agents
  drop constraint if exists agents_organization_reports_to_tenant_fkey;
alter table public.agents
  add constraint agents_organization_reports_to_tenant_fkey
  foreign key (organization_id, reports_to_agent_id)
  references public.agents (organization_id, id)
  not valid;
alter table public.agents
  validate constraint agents_organization_reports_to_tenant_fkey;

alter table public.departments
  drop constraint if exists departments_organization_manager_tenant_fkey;
alter table public.departments
  add constraint departments_organization_manager_tenant_fkey
  foreign key (organization_id, manager_agent_id)
  references public.agents (organization_id, id)
  not valid;
alter table public.departments
  validate constraint departments_organization_manager_tenant_fkey;

alter table public.departments
  drop constraint if exists departments_organization_parent_tenant_fkey;
alter table public.departments
  add constraint departments_organization_parent_tenant_fkey
  foreign key (organization_id, parent_department_id)
  references public.departments (organization_id, id)
  not valid;
alter table public.departments
  validate constraint departments_organization_parent_tenant_fkey;
